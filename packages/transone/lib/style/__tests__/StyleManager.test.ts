import { StyleManager } from '../StyleManager';
import { beforeEach, describe, expect, it } from 'bun:test';

describe('StyleManager', () => {
  let styleManager: StyleManager;

  beforeEach(() => {
    styleManager = new StyleManager();
  });

  describe('样式管理', () => {
    it('应该正确添加和管理样式', () => {
      const styleId = 'test-style';
      const styleOptions = {
        selector: '.test',
        properties: { color: 'red' },
      };

      styleManager.addStyle(styleId, styleOptions);
      expect(styleManager.styles.get(styleId)).toEqual(styleOptions);
    });

    it('应该正确更新样式内容', () => {
      const styleId = 'test-style';
      const initialStyle = {
        selector: '.test',
        properties: { color: 'red' },
      };
      const updatedStyle = {
        selector: '.test',
        properties: { color: 'blue' },
      };

      styleManager.addStyle(styleId, initialStyle);
      styleManager.addStyle(styleId, updatedStyle);
      expect(styleManager.styles.get(styleId)).toEqual(updatedStyle);
    });

    it('应该正确删除样式', () => {
      const styleId = 'test-style';
      const styleOptions = {
        selector: '.test',
        properties: { color: 'red' },
      };

      styleManager.addStyle(styleId, styleOptions);
      styleManager.removeStyle(styleId);
      expect(styleManager.styles.get(styleId)).toBeUndefined();
    });
  });

  describe('DOM操作', () => {
    it('应该正确创建和更新style元素的内容', () => {
      const styleId = 'test-style';
      const styleOptions = {
        selector: '.test',
        properties: { color: 'red' },
      };

      styleManager.addStyle(styleId, styleOptions);
      expect(styleManager.styleElement.textContent).toContain('.test');
      expect(styleManager.styleElement.textContent).toContain('color: red');
    });

    it('应该支持hover状态的样式', () => {
      const styleId = 'test-style';
      const styleOptions = {
        selector: '.test',
        properties: { color: 'red' },
        hover: { color: 'blue' },
      };

      styleManager.addStyle(styleId, styleOptions);
      expect(styleManager.styleElement.textContent).toContain('.test:hover');
      expect(styleManager.styleElement.textContent).toContain('color: blue');
    });

    it('应该支持media查询', () => {
      const styleId = 'test-style';
      const styleOptions = {
        selector: '.test',
        properties: { color: 'red' },
        media: {
          '(max-width: 768px)': { color: 'blue' },
        },
      };

      styleManager.addStyle(styleId, styleOptions);
      expect(styleManager.styleElement.textContent).toContain(
        '@media (max-width: 768px)'
      );
    });
  });

  describe('错误处理', () => {
    it('清除所有样式', () => {
      const styleId = 'test-style';
      const styleOptions = {
        selector: '.test',
        properties: { color: 'red' },
      };

      styleManager.addStyle(styleId, styleOptions);
      styleManager.clearStyles();
      expect(styleManager.styleElement.textContent).toBe('');
      expect(styleManager.styles.size).toBe(0);
    });
  });
});
