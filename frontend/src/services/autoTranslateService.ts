import { toolsService } from './apiService';

const NON_TRANSLATABLE_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT']);

function shouldSkipNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (NON_TRANSLATABLE_TAGS.has(parent.tagName)) return true;
  if (parent.closest('[data-no-auto-translate="true"]')) return true;
  const text = node.textContent?.trim() ?? '';
  if (!text) return true;
  if (text.length < 2) return true;
  return false;
}

export async function autoTranslateDom(targetLang: string, root: HTMLElement, cache: Map<string, string>, originals: WeakMap<Text, string>) {
  if (targetLang === 'en') {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const resetNodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!shouldSkipNode(node)) resetNodes.push(node);
    }
    resetNodes.forEach((node) => {
      const original = originals.get(node);
      if (original) node.textContent = original;
    });
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const uniq: string[] = [];
  const uniqSet = new Set<string>();

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (shouldSkipNode(node)) continue;

    if (!originals.has(node)) {
      originals.set(node, node.textContent || '');
    }

    nodes.push(node);
    const source = (originals.get(node) || '').trim();
    if (!source || uniqSet.has(source)) continue;
    uniqSet.add(source);
    uniq.push(source);
  }

  const toTranslate = uniq.filter((s) => !cache.has(`${targetLang}::${s}`)).slice(0, 280);
  await Promise.all(
    toTranslate.map(async (source) => {
      try {
        const translated = await toolsService.translate(source, targetLang);
        cache.set(`${targetLang}::${source}`, translated || source);
      } catch {
        cache.set(`${targetLang}::${source}`, source);
      }
    })
  );

  nodes.forEach((node) => {
    const source = (originals.get(node) || '').trim();
    if (!source) return;
    const translated = cache.get(`${targetLang}::${source}`);
    if (translated && node.textContent !== translated) {
      node.textContent = translated;
    }
  });

  const attrTargets = root.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label]');
  const attrSources: string[] = [];
  const attrSet = new Set<string>();

  attrTargets.forEach((el) => {
    if (el.closest('[data-no-auto-translate="true"]')) return;
    ['placeholder', 'title', 'aria-label'].forEach((attr) => {
      const value = el.getAttribute(attr);
      if (!value || value.trim().length < 2) return;
      const originalKey = `data-orig-${attr}`;
      if (!el.getAttribute(originalKey)) {
        el.setAttribute(originalKey, value);
      }
      const source = el.getAttribute(originalKey) || value;
      if (!attrSet.has(source)) {
        attrSet.add(source);
        attrSources.push(source);
      }
    });
  });

  const missingAttrTranslations = attrSources
    .filter((s) => !cache.has(`${targetLang}::${s}`))
    .slice(0, 220);

  await Promise.all(
    missingAttrTranslations.map(async (source) => {
      try {
        const translated = await toolsService.translate(source, targetLang);
        cache.set(`${targetLang}::${source}`, translated || source);
      } catch {
        cache.set(`${targetLang}::${source}`, source);
      }
    })
  );

  attrTargets.forEach((el) => {
    ['placeholder', 'title', 'aria-label'].forEach((attr) => {
      const originalKey = `data-orig-${attr}`;
      const source = el.getAttribute(originalKey);
      if (!source) return;
      const translated = cache.get(`${targetLang}::${source}`);
      if (translated) {
        el.setAttribute(attr, translated);
      }
    });
  });
}
