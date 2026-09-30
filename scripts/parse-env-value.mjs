export function parseEnvValue(raw) {
  const value = raw.trim();
  const quote = value[0];

  if (quote === '"' || quote === "'") {
    const end = value.lastIndexOf(quote);
    if (end > 0 && /^(\s*#.*)?$/.test(value.slice(end + 1))) {
      return value.slice(1, end);
    }
  }

  return value.replace(/\s+#.*$/, "").trim();
}
