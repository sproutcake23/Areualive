// Ambient declarations for static image assets imported from TypeScript.
// Metro resolves these to a numeric asset reference at bundle time, which is
// accepted anywhere an Image source is expected. All image imports go through
// constants/images.ts — see AGENTS.md → Image Rules.
declare module "*.png" {
  const value: number;
  export default value;
}

declare module "*.jpg" {
  const value: number;
  export default value;
}

declare module "*.jpeg" {
  const value: number;
  export default value;
}

declare module "*.gif" {
  const value: number;
  export default value;
}

declare module "*.webp" {
  const value: number;
  export default value;
}
