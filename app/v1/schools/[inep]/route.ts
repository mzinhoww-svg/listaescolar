import { otherMethods } from "@/features/b2b/api/handler";
import { withApiKey } from "@/features/b2b/api/with-api-key";
import { schoolEndpoint } from "@/features/b2b/api/endpoints/school";

export const dynamic = "force-dynamic";

export const GET = withApiKey(schoolEndpoint.entry, schoolEndpoint.impl);
export const { POST, PUT, PATCH, DELETE } = otherMethods(["GET"]);
