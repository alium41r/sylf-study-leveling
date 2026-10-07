"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferInstitution = inferInstitution;
exports.resolveAuthorities = resolveAuthorities;
exports.isVerifiedAuthorityHost = isVerifiedAuthorityHost;
exports.classifyHost = classifyHost;
const study_systems_1 = require("../../study-systems");
/**
 * Exam boards and examination authorities, by the registry value they appear under.
 *
 * Each entry is the body's own primary domain, chosen because the body publishes its
 * specifications there. The registry (`EXAM_BOARDS`) supplies the *names* Sylf already
 * shows students; this table supplies the hosts, and the two are deliberately separate
 * so that adding a board to the UI does not silently grant a domain authority.
 */
const BOARD_AUTHORITIES = {
    CAIE: { name: "Cambridge International", hosts: ["cambridgeinternational.org", "cie.org.uk"] },
    Edexcel: { name: "Pearson Edexcel", hosts: ["qualifications.pearson.com", "edexcel.com"] },
    "Oxford AQA International": { name: "Oxford AQA", hosts: ["oxfordaqa.com", "oxfordaqa-international.com"] },
    AQA: { name: "AQA", hosts: ["aqa.org.uk"] },
    OCR: { name: "OCR", hosts: ["ocr.org.uk"] },
    "WJEC/Eduqas": { name: "WJEC / Eduqas", hosts: ["wjec.co.uk", "eduqas.co.uk"] },
    CCEA: { name: "CCEA", hosts: ["ccea.org.uk"] },
    AP: { name: "College Board", hosts: ["apstudents.collegeboard.org", "collegeboard.org"] },
    IB: { name: "International Baccalaureate", hosts: ["ibo.org"] },
    FBISE: { name: "FBISE", hosts: ["fbise.edu.pk"] },
    // Corrected from Phase 2: `bisep.edu.pk` is BISE Peshawar, not Punjab.
    "BISE Punjab": { name: "BISE Lahore", hosts: ["biselahore.com"] },
    "BISE Sindh": { name: "BISE Karachi", hosts: ["biek.edu.pk"] },
    "BISE KPK": { name: "BISE Peshawar", hosts: ["bisep.edu.pk"] },
    "BISE Balochistan": { name: "BISE Quetta", hosts: ["bisequetta.edu.pk"] },
    "AKU-EB": { name: "Aga Khan University Examination Board", hosts: ["aku.edu", "aku-eb.edu.pk"] },
    CBSE: { name: "CBSE", hosts: ["cbse.gov.in", "cbseacademic.nic.in"] },
    CISCE: { name: "CISCE", hosts: ["cisce.org"] },
    NIOS: { name: "NIOS", hosts: ["nios.ac.in"] },
};
/**
 * Universities that own the examinations Sylf plans for.
 *
 * A general model rather than a NUST special case: identity is recognised by name or
 * alias, and *only that identity's own hosts* can be official for its own exam. A
 * preparation site called "NUSTian Academy" is not an authority — and, more to the
 * point, even a perfect name match on the goal text grants nothing, because the
 * authority comes from the host list and nothing else.
 */
const UNIVERSITY_AUTHORITIES = [
    { name: "NUST", aliases: ["nust", "net"], hosts: ["nust.edu.pk"] },
    { name: "FAST", aliases: ["fast", "nuces"], hosts: ["nu.edu.pk"] },
    { name: "GIKI", aliases: ["giki"], hosts: ["giki.edu.pk"] },
    { name: "LUMS", aliases: ["lums"], hosts: ["lums.edu.pk"] },
    { name: "UET Lahore", aliases: ["uet"], hosts: ["uet.edu.pk"] },
    { name: "NED University", aliases: ["ned"], hosts: ["neduet.edu.pk"] },
    { name: "Aga Khan University", aliases: ["aku"], hosts: ["aku.edu"] },
    { name: "University of the Punjab", aliases: ["pu"], hosts: ["pu.edu.pk"] },
    { name: "Quaid-i-Azam University", aliases: ["qau"], hosts: ["qau.edu.pk"] },
];
/**
 * Hosts that are credible without being the authority for a target.
 *
 * Suffix rules live here — `.edu`, `.ac.<cc>`, `.gov`, `.gov.<cc>`, `.mil` — and their
 * only effect is INSTITUTIONAL. A government or academic TLD is evidence of an
 * institution, never of *the* institution that owns a given syllabus.
 */
const INSTITUTIONAL_SUFFIXES = [".edu", ".mil", ".gov"];
/** Matches `gov.uk`, `education.gov.pk`, `ox.ac.uk`, `mit.edu.au` — anchored at a label boundary. */
const INSTITUTIONAL_SECOND_LEVEL = /(^|\.)(edu|ac|gov|mil)\.[a-z]{2}$/;
/**
 * Known academic hosts whose top-level domain carries no institutional signal.
 *
 * Small and explicit on purpose: a Canadian or Japanese university on a commercial TLD
 * is a real institution, but a TLD cannot say so, and inferring it from a guess is
 * exactly what this module exists to stop. Adding a host here is a deliberate act.
 */
const INSTITUTIONAL_HOSTS = ["uwaterloo.ca", "utoronto.ca", "ubc.ca", "mcgill.ca", "u-tokyo.ac.jp"];
const hostOf = (value) => {
    try {
        return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase().replace(/\.$/, "");
    }
    catch {
        return value.trim().toLowerCase().replace(/\.$/, "");
    }
};
const normaliseHost = (host) => hostOf(host).replace(/^www\./, "");
/**
 * Whole-token match, so "NUSTian" is not "NUST" and "networking" is not "NET".
 *
 * Tolerant on purpose: this is a classifier fed by several callers, and a target with no
 * goal text must yield "no institution", not an exception that takes a research run
 * down with it.
 */
function mentions(goal, token) {
    const words = String(goal ?? "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    return words.includes(token.toLowerCase());
}
/** The institution named in the goal, if Sylf recognises one. */
function inferInstitution(goal) {
    for (const authority of UNIVERSITY_AUTHORITIES) {
        // The authority's own name must appear as a whole word. An alias alone (e.g. "net")
        // is not enough to identify an institution: too many exams are called a net.
        if (mentions(goal, authority.name) || mentions(goal, authority.name.replace(/\s.*/, "")))
            return { name: authority.name, hosts: authority.hosts };
    }
    return null;
}
function resolveAuthorities(target) {
    const hosts = [];
    const recognised = [];
    const requestedBoard = target.board?.trim();
    const board = requestedBoard ? Object.entries(BOARD_AUTHORITIES).find(([value, authority]) => [value, authority.name, study_systems_1.EXAM_BOARDS.find(entry => entry.value === value)?.label].some(name => name?.toLowerCase() === requestedBoard?.toLowerCase()))?.[0] ?? requestedBoard : undefined;
    const known = board && (study_systems_1.EXAM_BOARDS.some((entry) => entry.value === board) || BOARD_AUTHORITIES[board]);
    const boardAuthority = board ? BOARD_AUTHORITIES[board] : undefined;
    if (known && boardAuthority) {
        recognised.push({ kind: "BOARD", name: boardAuthority.name, hosts: boardAuthority.hosts });
        hosts.push(...boardAuthority.hosts);
    }
    const institution = inferInstitution(target.goal);
    if (institution) {
        recognised.push({ kind: "UNIVERSITY", name: institution.name, hosts: institution.hosts });
        hosts.push(...institution.hosts);
    }
    // An academic level can itself name a board outright (AP, IB HL/SL); the registry
    // supplies those names, and only those, so an unrecognised level adds nothing.
    const level = target.level?.trim();
    if (level && study_systems_1.ACADEMIC_LEVELS.some((entry) => entry.value === level) && BOARD_AUTHORITIES[level]) {
        const authority = BOARD_AUTHORITIES[level];
        recognised.push({ kind: "BOARD", name: authority.name, hosts: authority.hosts });
        hosts.push(...authority.hosts);
    }
    return { hosts: [...new Set(hosts)], recognised };
}
/** Is this host one of the verified authorities for this target? */
function isVerifiedAuthorityHost(host, target) {
    const candidate = normaliseHost(host);
    if (!candidate)
        return false;
    return resolveAuthorities(target).hosts.some((verified) => candidate === verified || candidate.endsWith(`.${verified}`));
}
/**
 * The three-way verdict, from the host alone.
 *
 * `OFFICIAL` needs a verified authority host for this target; `INSTITUTIONAL` needs a
 * credible academic or government host; everything else is `SECONDARY`. The path is
 * never consulted — see the module comment for why that is the point.
 */
function classifyHost(host, target) {
    const candidate = normaliseHost(host);
    if (!candidate)
        return "SECONDARY";
    if (isVerifiedAuthorityHost(candidate, target))
        return "OFFICIAL";
    if (INSTITUTIONAL_SUFFIXES.some((suffix) => candidate.endsWith(suffix)))
        return "INSTITUTIONAL";
    if (INSTITUTIONAL_SECOND_LEVEL.test(candidate))
        return "INSTITUTIONAL";
    if (INSTITUTIONAL_HOSTS.some((known) => candidate === known || candidate.endsWith(`.${known}`)))
        return "INSTITUTIONAL";
    return "SECONDARY";
}
