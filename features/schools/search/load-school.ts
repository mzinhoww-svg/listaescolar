import "server-only";

import { cache } from "react";

import { getSchoolByInep } from "./repository";

/** Uma consulta por requisição, compartilhada entre generateMetadata e a página. */
export const loadSchool = cache((inep: string) => getSchoolByInep(inep));
