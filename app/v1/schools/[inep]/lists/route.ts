import { otherMethods, withApiKey } from "@/features/b2b/api/handler";
import { schoolListsEndpoint } from "@/features/b2b/api/endpoints/school-lists";

export const dynamic = "force-dynamic";

export const GET = withApiKey(schoolListsEndpoint.entry, schoolListsEndpoint.impl);
export const { POST, PUT, PATCH, DELETE } = otherMethods(["GET"]);
