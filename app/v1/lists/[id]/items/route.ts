import { otherMethods, withApiKey } from "@/features/b2b/api/handler";
import { listItemsEndpoint } from "@/features/b2b/api/endpoints/list-items";

export const dynamic = "force-dynamic";

export const GET = withApiKey(listItemsEndpoint.entry, listItemsEndpoint.impl);
export const { POST, PUT, PATCH, DELETE } = otherMethods(["GET"]);
