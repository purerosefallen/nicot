import { getEntityManagerToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';
import {
  DynamicModule,
  Inject,
  Injectable,
  Module,
  NestInterceptor,
  NestModule,
  Scope,
} from '@nestjs/common';
import { CallHandler } from '@nestjs/common/interfaces/features/nest-interceptor.interface';
import { ExecutionContext } from '@nestjs/common/interfaces/features/execution-context.interface';
import { createProvider } from 'nesties';
import { REQUEST } from '@nestjs/core';
import { createDynamicFetcherProxy } from './utility/create-dynamic-fetcher-proxy';
import { createInjectFromTokenFactory } from './utility/create-inject-from-token-factory';
import { Observable, Subscription } from 'rxjs';

const requestWeakMap = new WeakMap<any, EntityManager>();

const normalizeDataSourceToken = (token: string | Function) =>
  typeof token === 'string' ? token : token.name || token.toString();

export const TransactionalTypeOrmInterceptor = (
  dataSource?: DataSource | DataSourceOptions | string,
) => {
  const token = getEntityManagerToken(dataSource);
  const interceptorClass = class SpecificTransactionalTypeOrmInterceptor
    implements NestInterceptor
  {
    constructor(public entityManager: EntityManager) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const request = context.switchToHttp().getRequest();

      return new Observable((observer) => {
        let innerSub: Subscription | null = null;
        let finished = false;

        // 给 unsubscribe 用：让 transaction callback 里的 promise 也能被 reject
        let abort!: (err: any) => void;
        const aborted = new Promise<never>((_, reject) => {
          abort = reject;
        });

        const run = this.entityManager
          .transaction(async (txEm) => {
            requestWeakMap.set(request, txEm);

            // 这里不要 lastValueFrom —— 会“吃掉”流
            // 我们转而：订阅 next.handle()，把每个值实时转发出去
            const completion = new Promise<void>((resolve, reject) => {
              innerSub = next.handle().subscribe({
                next: (v) => observer.next(v),
                error: (err) => {
                  finished = true;
                  observer.error(err);
                  reject(err); // 触发 rollback
                },
                complete: () => {
                  finished = true;
                  observer.complete();
                  resolve(); // 触发 commit
                },
              });
            });

            // 事务必须等“流结束 or 被 abort”才结束
            // 如果客户端中途 unsubscribe，我们用 aborted 让事务 callback reject -> rollback
            await Promise.race([completion, aborted]);
          })
          .finally(() => {
            // 无论 commit/rollback，都清掉
            requestWeakMap.delete(request);
          })
          .catch((err) => {
            // transaction 内部已经 observer.error 过了，这里避免重复报错
            // 但如果是“在订阅前”就挂了，这里补一个 error
            if (!finished) observer.error(err);
          });

        // teardown: 上游取消 / 客户端断开
        return () => {
          try {
            innerSub?.unsubscribe();
          } finally {
            // 如果不是自然 complete/error，而是被取消：让事务 rollback
            if (!finished) {
              abort(new Error('Request aborted / subscription unsubscribed'));
            }
          }
        };
      });
    }
  };

  Object.defineProperty(interceptorClass, 'name', {
    value: `TransactionalTypeOrmInterceptor_${normalizeDataSourceToken(token)}`,
  });

  Reflect.defineMetadata(
    'design:paramtypes',
    [EntityManager],
    interceptorClass,
  );

  Inject(token)(interceptorClass.prototype, undefined, 0);
  Injectable()(interceptorClass);

  return interceptorClass;
};

export const getTransactionalEntityManagerToken = (
  dataSource?: DataSource | DataSourceOptions | string,
) =>
  `Transactional${normalizeDataSourceToken(getEntityManagerToken(dataSource))}`;

export const getTransactionalEntityManagerProvider = (
  dataSource?: DataSource | DataSourceOptions | string,
) =>
  createProvider(
    {
      provide: getTransactionalEntityManagerToken(dataSource),
      inject: [getEntityManagerToken(dataSource), REQUEST],
      scope: Scope.REQUEST,
    },
    (entityManager: EntityManager, request: any) => {
      if (requestWeakMap.has(request)) {
        return requestWeakMap.get(request);
      }
      return createDynamicFetcherProxy(
        entityManager,
        () => requestWeakMap.get(request) || entityManager,
      );
    },
  );

export const InjectTransactionalEntityManager = createInjectFromTokenFactory(
  getTransactionalEntityManagerToken,
);

export const getTransactionalRepositoryToken = (
  entity: Function,
  dataSource?: DataSource | DataSourceOptions | string,
) =>
  `Transactional${normalizeDataSourceToken(
    getEntityManagerToken(dataSource),
  )}Repository_${entity.name || entity.toString()}`;

export const getTransactionalRepositoryProvider = (
  entity: Function,
  dataSource?: DataSource | DataSourceOptions | string,
) =>
  createProvider(
    {
      provide: getTransactionalRepositoryToken(entity, dataSource),
      inject: [getEntityManagerToken(dataSource), REQUEST],
      scope: Scope.REQUEST,
    },
    (entityManager: EntityManager, req: Request) => {
      if (requestWeakMap.has(req)) {
        const transactionalEntityManager = requestWeakMap.get(req);
        return transactionalEntityManager.getRepository(entity);
      }

      return createDynamicFetcherProxy(
        entityManager.getRepository(entity),
        () => {
          const transactionalEntityManager =
            requestWeakMap.get(req) || entityManager;
          return transactionalEntityManager.getRepository(entity);
        },
      );
    },
  );

export const InjectTransactionalRepository = createInjectFromTokenFactory(
  getTransactionalRepositoryToken,
);

@Module({})
export class TransactionalTypeOrmModule {
  static forFeature(
    entities: Function | Function[],
    dataSource?: DataSource | DataSourceOptions | string,
  ): DynamicModule {
    const entityArray = Array.isArray(entities) ? entities : [entities];

    const providers = [
      getTransactionalEntityManagerProvider(dataSource),
      ...entityArray.map((entity) =>
        getTransactionalRepositoryProvider(entity, dataSource),
      ),
    ];

    const moduleImports = entityArray.length
      ? [TypeOrmModule.forFeature(entityArray, dataSource)]
      : [];

    const moduleExports = [...providers, ...moduleImports];

    return {
      module: TransactionalTypeOrmModule,
      imports: moduleImports,
      providers,
      exports: moduleExports,
    };
  }
}
