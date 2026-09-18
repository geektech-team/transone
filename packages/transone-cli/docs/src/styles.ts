import type { StyleSheet } from '@geektech/tsone';

/**
 * 文档站全局样式。作为 StyleSheet 传给 SSR 文档壳（renderHtmlDocument 的
 * styles 选项），构建产物的 HTML 直接内联 <style>，客户端无需重新注入。
 */

const ACCENT = '#2563eb';
const ACCENT_SOFT = '#eff6ff';
const TEXT = '#1f2937';
const TEXT_MUTED = '#64748b';
const BORDER = '#e2e8f0';
const BG = '#ffffff';
const BG_SOFT = '#f8fafc';
const CODE_BG = '#0f172a';
const CODE_TEXT = '#e2e8f0';

export const docsStyles: StyleSheet = [
  {
    selector: '*',
    properties: { boxSizing: 'border-box', margin: 0, padding: 0 },
  },
  {
    selector: 'html',
    properties: {
      WebkitTextSizeAdjust: '100%',
      scrollPaddingTop: '72px',
    },
  },
  {
    selector: 'body',
    properties: {
      background: BG,
      color: TEXT,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
      fontSize: '16px',
      lineHeight: 1.7,
    },
  },
  {
    selector: 'a',
    properties: { color: ACCENT, textDecoration: 'none' },
  },
  {
    selector: 'a:hover',
    properties: { textDecoration: 'underline' },
  },
  {
    selector: 'code',
    properties: {
      fontFamily:
        '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      fontSize: '0.875em',
    },
  },
  {
    selector: 'h1, h2, h3, h4',
    properties: { lineHeight: 1.35, marginTop: '2rem', marginBottom: '0.75rem' },
  },
  {
    selector: 'h1',
    properties: { fontSize: '1.9rem', marginTop: 0 },
  },
  {
    selector: 'h2',
    properties: {
      fontSize: '1.4rem',
      paddingBottom: '0.4rem',
      borderBottom: `1px solid ${BORDER}`,
    },
  },
  {
    selector: 'h3',
    properties: { fontSize: '1.15rem' },
  },
  {
    selector: 'p, ul, ol',
    properties: { marginBottom: '1rem' },
  },
  {
    selector: 'ul, ol',
    properties: { paddingLeft: '1.5rem' },
  },
  {
    selector: 'li',
    properties: { marginBottom: '0.35rem' },
  },
  // ---- 布局 ----
  {
    selector: '.doc-header',
    properties: {
      position: 'sticky',
      top: 0,
      zIndex: 10,
      background: 'rgba(255, 255, 255, 0.92)',
      backdropFilter: 'saturate(180%) blur(12px)',
      borderBottom: `1px solid ${BORDER}`,
    },
  },
  {
    selector: '.doc-header-inner',
    properties: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 24px',
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
    },
  },
  {
    selector: '.doc-brand',
    properties: {
      fontSize: '1.1rem',
      fontWeight: 700,
      color: TEXT,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
  },
  {
    selector: '.doc-brand-mark',
    properties: {
      width: '26px',
      height: '26px',
      borderRadius: '7px',
      background: ACCENT,
      color: '#fff',
      fontSize: '0.8rem',
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  },
  {
    selector: '.doc-header-nav',
    properties: {
      display: 'flex',
      gap: '4px',
      alignItems: 'center',
      flex: 1,
    },
  },
  {
    selector: '.doc-header-link',
    properties: {
      color: TEXT_MUTED,
      fontSize: '0.95rem',
      padding: '6px 10px',
      borderRadius: '6px',
    },
  },
  {
    selector: '.doc-header-link:hover',
    properties: { color: TEXT, background: BG_SOFT, textDecoration: 'none' },
  },
  {
    selector: '.doc-header-external',
    properties: { color: TEXT_MUTED, fontSize: '0.9rem', padding: '6px 8px' },
  },
  {
    selector: '.doc-layout',
    properties: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 24px',
      display: 'flex',
      gap: '48px',
      alignItems: 'flex-start',
    },
  },
  {
    selector: '.doc-sidebar',
    properties: {
      width: '220px',
      flexShrink: 0,
      position: 'sticky',
      top: '72px',
      maxHeight: 'calc(100vh - 88px)',
      overflowY: 'auto',
      padding: '24px 0 48px',
    },
  },
  {
    selector: '.doc-nav-section',
    properties: { marginBottom: '20px' },
  },
  {
    selector: '.doc-nav-title',
    properties: {
      fontSize: '0.75rem',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: TEXT_MUTED,
      marginBottom: '8px',
    },
  },
  {
    selector: '.doc-nav-link',
    properties: {
      display: 'block',
      padding: '6px 12px',
      borderRadius: '8px',
      color: TEXT,
      fontSize: '0.95rem',
    },
  },
  {
    selector: '.doc-nav-link:hover',
    properties: { background: BG_SOFT, textDecoration: 'none' },
  },
  {
    selector: '.doc-nav-link.active',
    properties: {
      background: ACCENT_SOFT,
      color: ACCENT,
      fontWeight: 600,
    },
  },
  {
    selector: '.doc-content',
    properties: {
      flex: 1,
      minWidth: 0,
      maxWidth: '820px',
      padding: '24px 0 64px',
    },
  },
  {
    selector: '.doc-home',
    properties: { flex: 1, minWidth: 0, padding: '8px 0 64px' },
  },
  {
    selector: '.doc-footer',
    properties: {
      borderTop: `1px solid ${BORDER}`,
      color: TEXT_MUTED,
      fontSize: '0.85rem',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px 24px 40px',
    },
  },
  // ---- 首页 ----
  {
    selector: '.doc-hero',
    properties: {
      padding: '72px 0 48px',
      maxWidth: '760px',
    },
  },
  {
    selector: '.doc-hero-badge',
    properties: {
      display: 'inline-block',
      background: ACCENT_SOFT,
      color: ACCENT,
      fontSize: '0.8rem',
      fontWeight: 600,
      padding: '4px 12px',
      borderRadius: '999px',
      marginBottom: '20px',
    },
  },
  {
    selector: '.doc-hero-title',
    properties: { fontSize: '2.6rem', fontWeight: 800, marginBottom: '16px' },
  },
  {
    selector: '.doc-hero-subtitle',
    properties: {
      fontSize: '1.15rem',
      color: TEXT_MUTED,
      marginBottom: '28px',
      lineHeight: 1.8,
    },
  },
  {
    selector: '.doc-hero-actions',
    properties: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  },
  {
    selector: '.doc-btn',
    properties: {
      display: 'inline-block',
      padding: '10px 20px',
      borderRadius: '8px',
      fontSize: '0.95rem',
      fontWeight: 600,
      border: `1px solid ${BORDER}`,
      color: TEXT,
      background: BG,
    },
  },
  {
    selector: '.doc-btn:hover',
    properties: { textDecoration: 'none', borderColor: ACCENT },
  },
  {
    selector: '.doc-btn-primary',
    properties: {
      background: ACCENT,
      borderColor: ACCENT,
      color: '#fff',
    },
  },
  {
    selector: '.doc-btn-primary:hover',
    properties: { background: '#1d4ed8', borderColor: '#1d4ed8' },
  },
  {
    selector: '.doc-feature-grid',
    properties: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '16px',
      marginBottom: '48px',
    },
  },
  {
    selector: '.doc-feature',
    properties: {
      border: `1px solid ${BORDER}`,
      borderRadius: '12px',
      padding: '20px',
      background: BG_SOFT,
    },
  },
  {
    selector: '.doc-feature-title',
    properties: { fontWeight: 700, marginBottom: '6px' },
  },
  {
    selector: '.doc-feature-desc',
    properties: { fontSize: '0.9rem', color: TEXT_MUTED, margin: 0 },
  },
  {
    selector: '.doc-link-grid',
    properties: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: '16px',
    },
  },
  {
    selector: '.doc-link-card',
    properties: {
      display: 'block',
      border: `1px solid ${BORDER}`,
      borderRadius: '12px',
      padding: '18px',
      color: TEXT,
      background: BG,
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    },
  },
  {
    selector: '.doc-link-card:hover',
    properties: {
      textDecoration: 'none',
      borderColor: ACCENT,
      boxShadow: '0 4px 16px rgba(37, 99, 235, 0.08)',
    },
  },
  {
    selector: '.doc-link-card-title',
    properties: { fontWeight: 700, color: ACCENT, marginBottom: '4px' },
  },
  {
    selector: '.doc-link-card-desc',
    properties: { fontSize: '0.88rem', color: TEXT_MUTED, margin: 0 },
  },
  // ---- 正文块 ----
  {
    selector: '.doc-article-title',
    properties: { fontSize: '2rem', fontWeight: 800, marginBottom: '8px' },
  },
  {
    selector: '.doc-article-desc',
    properties: {
      color: TEXT_MUTED,
      fontSize: '1.05rem',
      marginBottom: '32px',
    },
  },
  {
    selector: '.doc-code',
    properties: { marginBottom: '1rem' },
  },
  {
    selector: '.doc-code-lang',
    properties: {
      background: '#1e293b',
      color: '#94a3b8',
      fontSize: '0.72rem',
      padding: '4px 14px',
      borderTopLeftRadius: '10px',
      borderTopRightRadius: '10px',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
  },
  {
    selector: '.doc-code pre',
    properties: {
      background: CODE_BG,
      color: CODE_TEXT,
      padding: '16px 20px',
      borderRadius: '10px',
      overflowX: 'auto',
      fontSize: '0.875rem',
      lineHeight: 1.6,
      borderTopLeftRadius: 0,
    },
  },
  {
    selector: '.doc-inline-code',
    properties: {
      background: BG_SOFT,
      border: `1px solid ${BORDER}`,
      borderRadius: '5px',
      padding: '0.1em 0.4em',
      color: '#0f172a',
    },
  },
  {
    selector: '.doc-table-wrap',
    properties: { overflowX: 'auto', marginBottom: '1rem' },
  },
  {
    selector: '.doc-table',
    properties: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.92rem',
      marginBottom: '0.5rem',
    },
  },
  {
    selector: '.doc-table th',
    properties: {
      textAlign: 'left',
      background: BG_SOFT,
      fontWeight: 600,
      padding: '10px 14px',
      borderBottom: `1px solid ${BORDER}`,
      whiteSpace: 'nowrap',
    },
  },
  {
    selector: '.doc-table td',
    properties: {
      padding: '10px 14px',
      borderBottom: `1px solid ${BORDER}`,
      verticalAlign: 'top',
    },
  },
  {
    selector: '.doc-table-caption',
    properties: {
      fontWeight: 700,
      fontSize: '0.95rem',
      marginBottom: '8px',
    },
  },
  {
    selector: '.doc-callout',
    properties: {
      borderRadius: '10px',
      padding: '14px 18px',
      marginBottom: '1rem',
      fontSize: '0.95rem',
      borderLeft: '4px solid',
    },
  },
  {
    selector: '.doc-callout-title',
    properties: { fontWeight: 700, marginBottom: '4px' },
  },
  {
    selector: '.doc-callout-info',
    properties: {
      background: ACCENT_SOFT,
      borderLeftColor: ACCENT,
      color: '#1e3a8a',
    },
  },
  {
    selector: '.doc-callout-tip',
    properties: {
      background: '#f0fdf4',
      borderLeftColor: '#16a34a',
      color: '#14532d',
    },
  },
  {
    selector: '.doc-callout-warn',
    properties: {
      background: '#fffbeb',
      borderLeftColor: '#d97706',
      color: '#78350f',
    },
  },
  {
    selector: '.doc-404',
    properties: { padding: '80px 0', textAlign: 'center' },
  },
  {
    selector: '.doc-404-title',
    properties: { fontSize: '1.6rem', fontWeight: 700, marginBottom: '12px' },
  },
  // ---- 响应式 ----
  {
    atRule: '@media (max-width: 900px)',
    rules: [
      {
        selector: '.doc-layout',
        properties: { flexDirection: 'column', gap: '8px' },
      },
      {
        selector: '.doc-sidebar',
        properties: {
          width: '100%',
          position: 'static',
          maxHeight: 'none',
          overflowY: 'visible',
          padding: '8px 0',
          display: 'none',
        },
      },
      {
        selector: '.doc-hero-title',
        properties: { fontSize: '2rem' },
      },
      {
        selector: '.doc-header-nav',
        properties: { display: 'none' },
      },
    ],
  },
];
