// Unicode 字素簇（用户感知字符）切分。
// 一个字位 = 一个字素簇：e + 组合重音、emoji+ZWJ、谚文音节都按一个字位计数。
const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });

export function graphemes(text) {
  const out = [];
  for (const part of segmenter.segment(String(text ?? ""))) out.push(part.segment);
  return out;
}

export function graphemeCount(text) {
  return graphemes(text).length;
}

// 返回每个字素簇 {cluster, start, end}（基于码点的偏移，供错误定位）。
export function graphemeSpans(text) {
  const out = [];
  for (const part of segmenter.segment(String(text ?? ""))) {
    out.push({ cluster: part.segment, start: part.index, end: part.index + part.segment.length });
  }
  return out;
}
