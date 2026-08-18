import { SignJWT } from "jose";

async function run() {
  const secretKey = new TextEncoder().encode(process.env.JWT_SECRET || "super-secret-key-12345");
  const token = await new SignJWT({ userId: 1, email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretKey);

  console.log("Generated Token:", token);

  const response = await fetch("http://localhost:3000/api/ai-planner", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      topic: "maths",
      targetDate: "2026-08-15",
      syllabus: "AS Level Maths cambridge 9709 first 5 chapters",
      effortHours: 15
    })
  });

  if (!response.body) return console.error("No body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(decoder.decode(value));
  }
}

run().catch(console.error);
