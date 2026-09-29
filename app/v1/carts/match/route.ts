import { otherMethods } from "@/features/b2b/api/handler";
import { withApiKey } from "@/features/b2b/api/with-api-key";
import { cartsMatchEndpoint } from "@/features/b2b/api/endpoints/carts-match";

export const dynamic = "force-dynamic";

export const POST = withApiKey(cartsMatchEndpoint.entry, cartsMatchEndpoint.impl);
export const { GET, PUT, PATCH, DELETE } = otherMethods(["POST"]);
