export function parsePlaylist(content, sourcePath = '') {
  const trimmed = content.trim();
  try {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const data = JSON.parse(content);
      return parseJSONPlaylist(data, sourcePath);
    }
  } catch (e) {
    // fallthrough to text parsing
  }

  if (trimmed.startsWith('#EXTM3U') || /#EXTINF/.test(content)) {
    return parseM3U(content, sourcePath);
  }

  // fallback: try line-per-url
  return content.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map((u, i) => ({ name: `item ${i+1}`, url: u, source: sourcePath }));
}

function parseJSONPlaylist(data, sourcePath) {
  // Expect an array of channels or an object with `channels` key
  const list = Array.isArray(data) ? data : data.channels || [];
  return list.map(item => ({
    name: item.name || item.title || item.tvg_name || 'Unnamed',
    url: item.url || item.file || item.link || item.stream || '',
    logo: item.logo || item.tvg_logo || item.icon || '',
    group: item.group || item.category || item.groupTitle || '',
    tvgId: item.tvg_id || item.tvgId || item.id || item.tvg || '',
    source: sourcePath
  })).filter(c => c.url);
}

function parseM3U(content, sourcePath) {
  const lines = content.split(/\r?\n/).map(l => l.trim());
  const items = [];
  let current = {};
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      current = {};
      const rest = line.substring(8);
      // attributes before comma
      const parts = rest.split(/,(.+)/);
      const attrPart = parts[0] || '';
      const namePart = (parts[1] || '').trim();
      current.name = namePart || attrPart || 'Unknown';
      // parse attrs like tvg-id, tvg-logo, group-title
      const attrRegex = /([a-zA-Z0-9\-]+)=\"([^\"]*)\"|([a-zA-Z0-9\-]+)=([^\s\"]+)/g;
      let m;
      while ((m = attrRegex.exec(attrPart)) !== null) {
        const key = m[1] || m[3];
        const val = m[2] || m[4] || '';
        if (/tvg\-logo/i.test(key)) current.logo = val;
        if (/tvg\-id|tvgid|id/i.test(key)) current.tvgId = val;
        if (/group\-title|group/i.test(key)) current.group = val;
      }
    } else if (line.startsWith('#')) {
      // skip other comments
    } else {
      // URL line
      current.url = line;
      current.source = sourcePath;
      if (!current.name) current.name = line;
      items.push(current);
      current = {};
    }
  }
  return items;
}
