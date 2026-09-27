import { otherMethods, withApiKey } from "@/features/b2b/api/handler";
import { schoolsEndpoint } from "@/features/b2b/api/endpoints/schools";

export const dynamic = "force-dynamic";

export const GET = withApiKey(schoolsEndpoint.entry, schoolsEndpoint.impl);
export const { POST, PUT, PATCH, DELETE } = otherMethods(["GET"]);
