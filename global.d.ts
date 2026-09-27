declare module "*.css";

// Asset imports (constants/images.ts). This belongs HERE, not in the
// pocketpal-ai reference repo's src/global.d.ts, which is what used to
// declare it — LiAI's typecheck was silently borrowing it from there and
// broke the moment pocketpal-ai was excluded.
declare module "*.png";
