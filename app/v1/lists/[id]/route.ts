import { otherMethods, withApiKey } from "@/features/b2b/api/handler";
import { listEndpoint } from "@/features/b2b/api/endpoints/list";

export const dynamic = "force-dynamic";

export const GET = withApiKey(listEndpoint.entry, listEndpoint.impl);
export const { POST, PUT, PATCH, DELETE } = otherMethods(["GET"]);
