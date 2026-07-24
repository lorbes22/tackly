// Login and signup are the same dynamic email-first flow now (AuthFlow) —
// both routes stay so existing links (/login, /signup) keep working, they
// just render identically and let the typed email decide which path to
// show, rather than each being its own static form.
export { default } from "@/pages/auth/AuthFlow";
