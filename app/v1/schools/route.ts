import { otherMethods } from "@/features/b2b/api/handler";
import { withApiKey } from "@/features/b2b/api/with-api-key";
import { schoolsEndpoint } from "@/features/b2b/api/endpoints/schools";

export const dynamic = "force-dynamic";

export const GET = withApiKey(schoolsEndpoint.entry, schoolsEndpoint.impl);
export const { POST, PUT, PATCH, DELETE } = otherMethods(["GET"]);
