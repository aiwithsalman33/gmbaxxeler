const MAX_LENGTH = 80;

export function slugifyFilename(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.(jpe?g|png)$/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
}
