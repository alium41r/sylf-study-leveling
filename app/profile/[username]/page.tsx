import { getProfileDossier } from "@/lib/profile-service";
import { PublicProfileClient } from "./PublicProfileClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ username: string }>;
}

export default async function PublicProfilePage(props: PageProps) {
  const params = await props.params;
  const { username } = params;

  // Server-side pre-fetch to eliminate client fetch waterfall
  const result = await getProfileDossier(username, null);

  return (
    <PublicProfileClient
      username={username}
      initialProfile={result.profile}
      initialRelationship={result.relationship}
      initialPermissions={result.permissions}
      initialError={result.error}
    />
  );
}
