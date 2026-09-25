// SessionActor único (D-046): a implementação vive em features/auth/actor.ts (uma marca, um WeakSet). Este módulo só reexporta
// para os importadores da trilha Comércio; um ator emitido por qualquer trilha vale nas duas.
export { getSessionActor, isSessionActor, type SessionActor } from "@/features/auth/actor";
