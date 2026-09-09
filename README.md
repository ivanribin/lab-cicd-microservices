# Лабораторная работа: полный цикл CI/CD для микросервисного приложения

Минимальное микросервисное приложение с полным CI/CD: сборка, тесты, security scan,
контейнеризация, blue-green деплой в Kubernetes, мониторинг и автоматический rollback.

## Сервисы

| Сервис | Стек | Назначение |
|---|---|---|
| `auth-service` | Node 22, Express | `POST /login` выдаёт JWT |
| `orders-service` | Node 22, Express, PostgreSQL | CRUD заказов, проверка JWT, миграции |
| `web-client` | nginx | Одна страница: вход, создание и просмотр заказов |

Прикладная логика намеренно минимальна: работа демонстрирует CI/CD-процесс,
а не бизнес-функциональность.

## Быстрый старт локально

```bash
cp .env.example .env
# заполнить реальные значения в .env
docker compose up -d --build
npm --prefix orders-service run migrate
```

Приложение: http://localhost:8080

## Структура

```
auth-service/     сервис аутентификации
orders-service/   сервис заказов, миграции БД
web-client/       статический фронтенд
infra/            helm-чарты, RBAC, скрипты деплоя
e2e/              end-to-end сценарий
.github/workflows/ CI и CD пайплайны
docs/             архитектура и скриншоты
```

Подробная документация появится по мере выполнения этапов B-E.
