import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { OneApp } from '../../core/app';
import { Component } from '../../core/component';
import { VNode } from '../../core/vnode';
import { resetRouter, useRouter } from '../instance';
import { Router, createRouter } from '../index';

class TestHomeComponent extends Component {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  render(): VNode {
    return {
      tag: 'div',
      props: { id: 'home' },
      children: ['Home Page'],
    };
  }
}

class TestAboutComponent extends Component {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  render(): VNode {
    return {
      tag: 'div',
      props: { id: 'about' },
      children: ['About Page'],
    };
  }
}

class TestUserComponent extends Component {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  render(): VNode {
    return {
      tag: 'div',
      props: { id: 'user' },
      children: ['User Page'],
    };
  }
}

class TestNotFoundComponent extends Component {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  render(): VNode {
    return {
      tag: 'div',
      props: { id: 'not-found' },
      children: ['Not Found'],
    };
  }
}

class TestRedirectTargetComponent extends Component {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  render(): VNode {
    return {
      tag: 'div',
      props: { id: 'redirect-target' },
      children: ['Redirect Target'],
    };
  }
}

describe('Router', () => {
  let router: Router;
  let app: OneApp;
  let pushStateSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    resetRouter();
    window.history.replaceState({}, '', '/');
    pushStateSpy?.mockRestore();
    pushStateSpy = spyOn(window.history, 'pushState');

    router = createRouter({
      routes: [
        { path: '/', component: TestHomeComponent },
        { path: '/about', component: TestAboutComponent },
        { path: '/users/:id', component: TestUserComponent, name: 'user' },
      ],
    });
    app = new OneApp();
  });

  describe('路由实例管理', () => {
    it('未安装时useRouter应该抛出错误', () => {
      expect(() => useRouter()).toThrow('Router is not initialized');
    });

    it('安装后应该可以通过useRouter访问', () => {
      router.install(app);
      expect(useRouter()).toBe(router);
    });
  });

  describe('createRouter', () => {
    it('应该正确创建路由实例', () => {
      expect(router).toBeInstanceOf(Router);
    });

    it('应该包含配置的路由', () => {
      expect(router.getRoutes()).toHaveLength(3);
      expect(router.getRoutes()[0].path).toBe('/');
      expect(router.getRoutes()[1].path).toBe('/about');
      expect(router.getRoutes()[2].path).toBe('/users/:id');
    });

    it('应该兼容README中的数组路由写法', () => {
      const arrayRouter = createRouter([
        { path: '/', component: TestHomeComponent },
      ]);

      expect(arrayRouter.getRoutes()).toHaveLength(1);
    });
  });

  describe('路由导航', () => {
    beforeEach(() => {
      router.install(app);
    });

    it('应该正确处理路由跳转', () => {
      router.push('/about');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/about');
      expect(router.getCurrentRoute()?.path).toBe('/about');
      expect(router.getCurrentRouteRecord()?.component).toBe(
        TestAboutComponent
      );
    });

    it('路径不存在时应匹配根路由组件但不重写当前URL', () => {
      window.history.replaceState({}, '', '/non-existent');
      router.install(app);

      expect(router.getCurrentRoute()?.path).toBe('/non-existent');
      expect(router.getCurrentRouteRecord()?.component).toBe(TestHomeComponent);
      expect(pushStateSpy).not.toHaveBeenCalledWith({}, '', '/');
    });

    it('应该允许取消路由变化监听', () => {
      const listener = mock();
      const unsubscribe = router.onRouteChange(listener);

      router.push('/about');
      unsubscribe();
      router.push('/');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('应该匹配动态路径并填充params', () => {
      router.push('/users/42?tab=profile');

      expect(router.getCurrentRouteRecord()?.component).toBe(TestUserComponent);
      expect(router.getCurrentRoute()).toMatchObject({
        path: '/users/42',
        name: 'user',
        params: { id: '42' },
        query: { tab: 'profile' },
      });
    });

    it('hash模式应该从path中分离query', () => {
      window.location.hash = '#/users/42?tab=profile';

      const hashRouter = createRouter({
        mode: 'hash',
        routes: [
          { path: '/', component: TestHomeComponent },
          { path: '/users/:id', component: TestUserComponent, name: 'user' },
        ],
      });

      expect(hashRouter.getCurrentRouteRecord()?.component).toBe(
        TestUserComponent
      );
      expect(hashRouter.getCurrentRoute()).toMatchObject({
        path: '/users/42',
        name: 'user',
        params: { id: '42' },
        query: { tab: 'profile' },
      });

      hashRouter.destroy();
    });
  });

  describe('导航守卫', () => {
    beforeEach(() => {
      router.install(app);
    });

    it('beforeEach 返回 false 时取消导航', () => {
      router.beforeEach(() => false);

      router.push('/about');

      expect(pushStateSpy).not.toHaveBeenCalled();
      expect(router.getCurrentRoute()?.path).toBe('/');
    });

    it('beforeEach 返回字符串时重定向到目标路径', () => {
      router.beforeEach((to) => {
        if (to.path === '/about') {
          return '/users/42';
        }
        return true;
      });

      router.push('/about');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/users/42');
      expect(router.getCurrentRouteRecord()?.component).toBe(TestUserComponent);
    });

    it('beforeEach 守卫按注册顺序执行且可移除', () => {
      const order: string[] = [];
      const first = router.beforeEach(() => {
        order.push('first');
        return true;
      });
      const second = router.beforeEach(() => {
        order.push('second');
        return false;
      });

      router.push('/about');
      expect(order).toEqual(['first', 'second']);
      expect(pushStateSpy).not.toHaveBeenCalled();

      order.length = 0;
      second();
      router.push('/about');
      expect(order).toEqual(['first']);
      expect(pushStateSpy).toHaveBeenCalled();

      first();
    });

    it('afterEach 在导航提交后调用', () => {
      const after = mock();
      router.afterEach(after);

      router.push('/about');

      expect(after).toHaveBeenCalledTimes(1);
      expect(after.mock.calls[0][0].path).toBe('/about');
      expect(after.mock.calls[0][1].path).toBe('/');
    });
  });

  describe('redirect', () => {
    it('push 到 redirect 路由时跳转到目标并更新 URL', () => {
      const redirectRouter = createRouter({
        routes: [
          { path: '/', component: TestHomeComponent },
          { path: '/old', redirect: '/new' },
          { path: '/new', component: TestRedirectTargetComponent },
        ],
      });
      redirectRouter.install(app);

      redirectRouter.push('/old');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/new');
      expect(redirectRouter.getCurrentRoute()?.path).toBe('/new');
      expect(redirectRouter.getCurrentRouteRecord()?.component).toBe(
        TestRedirectTargetComponent
      );
      redirectRouter.destroy();
    });

    it('初始 URL 命中 redirect 路由时解析到目标', () => {
      window.history.replaceState({}, '', '/old');

      const redirectRouter = createRouter({
        routes: [
          { path: '/', component: TestHomeComponent },
          { path: '/old', redirect: '/new' },
          { path: '/new', component: TestRedirectTargetComponent },
        ],
      });
      redirectRouter.install(app);

      expect(redirectRouter.getCurrentRouteRecord()?.component).toBe(
        TestRedirectTargetComponent
      );
      redirectRouter.destroy();
    });

    it('redirect 循环时抛出错误', () => {
      const loopRouter = createRouter({
        routes: [
          { path: '/a', redirect: '/b' },
          { path: '/b', redirect: '/a' },
        ],
      });
      loopRouter.install(app);

      expect(() => loopRouter.push('/a')).toThrow('Redirect loop detected');
      loopRouter.destroy();
    });
  });

  describe('catch-all 路由', () => {
    it('未匹配路径落到 * 通配路由并携带 pathMatch 参数', () => {
      window.history.replaceState({}, '', '/no/such/page');

      const wildcardRouter = createRouter({
        routes: [
          { path: '/', component: TestHomeComponent },
          { path: '*', component: TestNotFoundComponent },
        ],
      });
      wildcardRouter.install(app);

      expect(wildcardRouter.getCurrentRouteRecord()?.component).toBe(
        TestNotFoundComponent
      );
      expect(wildcardRouter.getCurrentRoute()?.params).toEqual({
        pathMatch: '/no/such/page',
      });
      wildcardRouter.destroy();
    });

    it('编程导航到未匹配路径时使用通配路由', () => {
      const wildcardRouter = createRouter({
        routes: [
          { path: '/', component: TestHomeComponent },
          { path: '*', component: TestNotFoundComponent },
        ],
      });
      wildcardRouter.install(app);

      wildcardRouter.push('/missing');

      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/missing');
      expect(wildcardRouter.getCurrentRouteRecord()?.component).toBe(
        TestNotFoundComponent
      );
      wildcardRouter.destroy();
    });

    it('同路径 push 不做重复入栈', () => {
      router.install(app);

      router.push('/');
      router.push('/');
      router.push('/');

      expect(pushStateSpy).not.toHaveBeenCalled();
    });
  });
});
