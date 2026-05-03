/**
 * Sprint Flight-1 RF-10 / D14: re-export do Sidebar canonico para o path
 * esperado pelos testes (`@/components/layout/Sidebar`).
 *
 * Sidebar real vive em `client/src/components/Sidebar.tsx` (legado). Este
 * arquivo eh apenas um shim de re-export para preservar import path estavel.
 */
export { default } from "../Sidebar";
export { default as Sidebar } from "../Sidebar";
