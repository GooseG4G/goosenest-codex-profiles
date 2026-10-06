function createProviderSlug(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'provider';
}

function createEnvKey(name) {
  const key = String(name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${key || 'PROVIDER'}_ACCESS_TOKEN`;
}

function createUniqueEnvKey(name, profiles) {
  const base = createEnvKey(name).replace(/_ACCESS_TOKEN$/, '');
  const occupied = new Set(profiles.map((profile) => profile.envKey).filter(Boolean));
  let candidate = `${base}_ACCESS_TOKEN`;
  let suffix = 2;
  while (occupied.has(candidate)) {
    candidate = `${base}_${suffix}_ACCESS_TOKEN`;
    suffix += 1;
  }
  return candidate;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function normalizeTomlSpacing(contents) {
  return contents
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function formatTomlFile(contents) {
  const normalized = normalizeTomlSpacing(contents);
  return normalized ? `${normalized}\n` : '';
}

function readProviderTableName(tableName) {
  const prefix = 'model_providers.';
  if (!tableName.startsWith(prefix)) return null;
  const key = tableName.slice(prefix.length);
  if (!key.startsWith('"')) return key.split('.')[0] || null;
  const quotedKey = key.match(/^("(?:\\.|[^"\\])*")/u)?.[1];
  if (!quotedKey) return null;
  try { return JSON.parse(quotedKey); } catch { return null; }
}

function stripManagedProviderConfig(contents, providers) {
  const providerSet = new Set(providers.filter(Boolean));
  const lines = contents.split(/\r?\n/);
  const output = [];
  let skippingProvider = false;
  let inRootTable = true;

  for (const line of lines) {
    const tableMatch = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (tableMatch) {
      inRootTable = false;
      skippingProvider = providerSet.has(readProviderTableName(tableMatch[1]));
      if (skippingProvider) continue;
    }
    if (skippingProvider) continue;
    if (inRootTable && /^\s*model_provider\s*=/.test(line)) continue;
    output.push(line);
  }

  return normalizeTomlSpacing(output.join('\n'));
}

function appendProviderConfig(contents, profile) {
  const base = stripManagedProviderConfig(contents, [profile.provider]);
  const providerBlock = [
    `[model_providers.${tomlString(profile.provider)}]`,
    `name = ${tomlString(profile.name)}`,
    `base_url = ${tomlString(profile.baseUrl)}`,
    `env_key = ${tomlString(profile.envKey)}`,
    'wire_api = "responses"',
  ].join('\n');
  const rootProvider = `model_provider = ${tomlString(profile.provider)}`;
  return formatTomlFile(`${rootProvider}\n\n${base ? `${base}\n\n` : ''}${providerBlock}`);
}

function readRootModelProvider(contents) {
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) return null;
    const match = line.match(/^\s*model_provider\s*=\s*(['"])(.*?)\1\s*(?:#.*)?$/);
    if (match) return match[2];
  }
  return null;
}

function upsertEnvValue(contents, key, value) {
  const lines = contents.split(/\r?\n/);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=`);
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (!pattern.test(line)) return line;
    replaced = true;
    return `${key}=${value}`;
  });
  if (!replaced) nextLines.push(`${key}=${value}`);
  return `${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n').trimEnd()}\n`;
}

function readEnvValue(contents, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = contents.match(new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=\\s*(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function removeEnvValue(contents, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=`);
  return `${contents.split(/\r?\n/).filter((line) => !pattern.test(line)).join('\n').trimEnd()}\n`;
}

module.exports = {
  appendProviderConfig,
  createProviderSlug,
  createUniqueEnvKey,
  formatTomlFile,
  readEnvValue,
  readRootModelProvider,
  removeEnvValue,
  stripManagedProviderConfig,
  upsertEnvValue,
};
