# Лабораторная работа: полный цикл CI/CD для микросервисного приложения

Микросервисное приложение с полным CI/CD-процессом: сборка, тесты, анализ безопасности,
контейнеризация, blue-green развёртывание в Kubernetes, мониторинг и автоматический rollback.

Прикладная логика намеренно минимальна (около 250 строк на три сервиса): работа
демонстрирует процесс доставки, а не бизнес-функциональность.

## Содержание

- [Архитектура](#архитектура)
- [Быстрый старт](#быстрый-старт)
- [Blue-green и rollback](#blue-green-и-rollback)
- [Соответствие критериям оценки](#соответствие-критериям-оценки)
- [Соответствие этапам работы](#соответствие-этапам-работы)

## Архитектура

```
                    ┌──────────────┐
   браузер  ────────│  web-client  │  nginx, NodePort 30080
                    └──────┬───────┘
                           │  /api/login          /api/orders
                    ┌──────┴───────┐        ┌──────────────────┐
                    │ auth-service │        │  orders-service  │
                    │  выдаёт JWT  │        │  проверяет JWT   │
                    └──────────────┘        └────────┬─────────┘
                                                     │
                                             ┌───────┴────────┐
                                             │   PostgreSQL   │
                                             │  StatefulSet   │
                                             └────────────────┘
```

| Сервис | Стек | Роль |
|---|---|---|
| [auth-service](auth-service/) | Node 22, Express 5 | `POST /login` выдаёт JWT |
| [orders-service](orders-service/) | Node 22, Express 5, PostgreSQL | заказы, проверка JWT, миграции схемы |
| [web-client](web-client/) | nginx | страница входа и работы с заказами |

Все сервисы отдают `/health` (liveness), `/ready` (readiness) и `/metrics` (Prometheus).
У orders-service `/ready` дополнительно проверяет соединение с базой, поэтому под не
принимает трафик, пока PostgreSQL недоступен.

## Быстрый старт

### Локально через Docker Compose

```bash
cp .env.example .env          # заполнить реальными значениями
docker compose up -d --build
npm --prefix orders-service run migrate
```

Приложение: http://localhost:8080

### Локально в Kubernetes (kind)

Требуется `docker`, `kind`, `helm`, `kubectl`, `node`.

```bash
bash infra/scripts/kind-up.sh
```

Скрипт создаёт кластер, применяет RBAC, генерирует секреты из `.env`, собирает образы,
разворачивает PostgreSQL, Prometheus, Grafana и выкатывает все три сервиса blue-green.

| Что | Адрес |
|---|---|
| Приложение | http://localhost:8080 |
| Grafana | http://localhost:3000 |
| Prometheus | http://localhost:9090 |

### Проверки

```bash
npm --prefix auth-service test              # unit
npm --prefix orders-service test            # unit
npm --prefix orders-service run test:integration   # нужен DATABASE_URL
bash infra/scripts/run-e2e.sh               # e2e против кластера
```

## Blue-green и rollback

Каждый сервис развёрнут двумя Deployment (`-blue` и `-green`) за двумя Service:

- **основной** Service с селектором `color: <активный>` - его видят пользователи
- **preview** Service с селектором на неактивный цвет - только для проверок

Важная деталь реализации: **у каждого цвета свой тег образа**. Если бы тег был общий,
`helm upgrade` пересоздал бы и работающий цвет тоже, и смысл безопасного выката пропал бы.
[deploy.sh](infra/scripts/deploy.sh) читает текущий тег активного цвета прямо из кластера
и передаёт его обратно без изменений.

Порядок выката:

1. определить активный цвет из селектора Service
2. выкатить противоположный цвет с новым образом, трафик не трогать
3. дождаться readiness нового цвета
4. прогнать e2e **через preview Service**
5. только при успехе переключить селектор основного Service

### Три уровня отката

| Уровень | Когда срабатывает | Механизм |
|---|---|---|
| 1 | поды не проходят readiness | `helm upgrade --atomic` откатывает релиз сам |
| 2 | e2e упали против preview | селектор не переключается, новый цвет выключается |
| 3 | нужно отменить уже переключённый релиз | [rollback.sh](infra/scripts/rollback.sh), запасной путь `helm rollback` |

Второй уровень - главный: пользовательский трафик не попадает на сломанную версию
ни на секунду, потому что проверка идёт до переключения, а не после.

Проверить работу отката можно вручную: запустить CD через `workflow_dispatch` с
галкой `fail_mode`. Пайплайн выкатит заведомо сломанный orders-service, убедится, что
активный цвет не изменился, и упадёт, если трафик всё же ушёл на сломанную версию.

## Соответствие критериям оценки

### CI pipeline и его корректность (20%)

Смотреть: [.github/workflows/ci.yml](.github/workflows/ci.yml), вкладка Actions.

Девять джобов: `lint`, `unit`, `integration`, `sast`, `sca`, `secrets`, `policy`, `helm`,
`build`. Первые восемь идут параллельно, `build` объявляет их все в `needs` и не стартует,
пока хоть один красный.

Гейт из этапа B п.5 работает буквально: Trivy сканирует образ **до** пуша в реестр.
Порядок в джобе `build` - сборка в локальный демон (`load: true`), скан на CRITICAL,
и только потом `docker push`. Уязвимый образ в GHCR не попадает вообще.

Что это не теория: на одном из прогонов гейт заблокировал все три образа из-за
CVE-2026-59873 в `tar` внутри npm и CVE-2026-31789 в OpenSSL базового образа nginx.
Исправлено удалением npm из runtime-слоя и обновлением базового образа, а не подавлением.

Джоб `policy` закрывает то, что не ловится ни сборкой, ни `helm template`: `latest`-теги
в `infra/` и нечисловой `USER` в Dockerfile. Вторая проверка тоже написана по факту
реального сбоя. Образ с `USER node` собирается, проходит линт чартов и рендеринг, но под
с `runAsNonRoot` не стартует: kubelet обязан доказать, что пользователь не root, **до**
запуска контейнера, а резолвить имя в uid умеет только runtime внутри образа. Ошибка
видна исключительно в работающем кластере, поэтому её ловля вынесена на CI.

### Реализация стратегии деплоя и rollback (20%)

Смотреть: [infra/helm/microservice/templates/](infra/helm/microservice/templates/),
[deploy.sh](infra/scripts/deploy.sh), [rollback.sh](infra/scripts/rollback.sh),
джоб `deploy` в [cd.yml](.github/workflows/cd.yml).

Подробности в разделе [Blue-green и rollback](#blue-green-и-rollback).
Probes заданы в [deployment.yaml](infra/helm/microservice/templates/deployment.yaml):
`livenessProbe` на `/health`, `readinessProbe` на `/ready`.

### Тесты: unit, integration, e2e (10%)

| Уровень | Файлы | Что проверяет |
|---|---|---|
| unit | [auth-service/test/](auth-service/test/), [orders-service/test/app.test.js](orders-service/test/app.test.js) | выдача и валидация JWT, отказ без токена, с чужой подписью, с истёкшим токеном, валидация запроса |
| integration | [integration.test.js](orders-service/test/integration.test.js) | против настоящего PostgreSQL: идемпотентность миграций, состав колонок, запись и чтение заказа |
| e2e | [e2e/run.js](e2e/run.js) | против развёрнутого кластера: логин, создание заказа, чтение, метрики, доступность web-client |

Раннер - встроенный `node --test`, без Jest и других зависимостей.

E2E возвращает ненулевой код при провале, и именно это служит триггером отката: тесты
не существуют отдельно от деплоя, а управляют им.

### Инфраструктура как код и секреты (10%)

Смотреть: [infra/](infra/), [.gitleaks.toml](.gitleaks.toml), [rbac.yaml](infra/k8s/rbac.yaml).

Вся инфраструктура описана Helm-чартами и манифестами, кластер - [kind-config.yaml](infra/kind-config.yaml).
Ничего не создаётся руками.

Секреты `JWT_SECRET`, `POSTGRES_PASSWORD`, `DEMO_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`
хранятся в GitHub Secrets и попадают в кластер как Kubernetes Secret. В подах
пробрасываются через `secretKeyRef`, поэтому не видны ни в чарте, ни в `helm get values`.
В репозитории только [.env.example](.env.example) с плейсхолдерами.

RBAC ограничен одним namespace. CD **реально работает под этим ServiceAccount**:
шаг пайплайна собирает kubeconfig из его токена, а отдельный шаг через `kubectl auth can-i`
печатает права в summary и валит сборку, если у деплойера окажется доступ к nodes.

### Миграции для БД (10%)

Смотреть: [migrate.js](orders-service/src/migrate.js), [migrations/](orders-service/migrations/),
[migration-job.yaml](infra/helm/microservice/templates/migration-job.yaml).

Раннер без внешних зависимостей ведёт таблицу `schema_migrations` и применяет только
неприменённые файлы, каждый в отдельной транзакции. Вторая миграция добавляет колонку
`status` к существующей таблице - это показывает инкрементальность, а не пересоздание схемы.

В кластере запускается как Helm hook (`pre-install,pre-upgrade`, вес `-5`) тем же образом,
что и сервис. Helm ждёт завершения hook до выката подов, поэтому схема всегда актуальна к
старту нового кода, а провал миграции останавливает релиз целиком.

### Мониторинг и метрики (10%)

Смотреть: [infra/helm/monitoring/](infra/helm/monitoring/), эндпоинты `/metrics`.

`@prometheus-io/client` отдаёт метрики процесса плюс `http_requests_total{method,route,status}`
и гистограмму `http_request_duration_seconds`. Prometheus собирает поды по аннотации
`prometheus.io/scrape`. Grafana поднимается с готовым [дашбордом](infra/helm/monitoring/dashboards/lab.json):
RPS, p95 задержки, доля 5xx и **число подов по цветам blue/green** - на последней панели
виден сам момент переключения трафика.

Сбор логов (этап D п.2): при падении CD собирает `kubectl logs`, `describe` и события
в артефакт workflow - разбор возможен уже после того, как эфемерный кластер уничтожен.

### Документация и читаемость кода (10%)

Этот README, [docs/architecture.md](docs/architecture.md) и скриншоты в [docs/screenshots/](docs/screenshots/).

## Соответствие этапам работы

| Пункт | Где реализован |
|---|---|
| A1 репозиторий | монорепозиторий: код и инфраструктура в одном коммите |
| A2 структура каталогов | `auth-service/`, `orders-service/`, `web-client/`, `infra/` |
| A3 Dockerfile, тесты, README | multi-stage сборки, non-root, `*/test/`, этот файл |
| A4 PostgreSQL | [postgresql чарт](infra/helm/postgresql/), `docker-compose.yml` |
| B1 линтеры, unit-тесты | джобы `lint`, `unit` |
| B2 интеграционные тесты | джоб `integration` с service-контейнером postgres |
| B3 security scan | `sast` (CodeQL), `sca` (npm audit + Trivy fs), скан образов |
| B4 сборка и пуш образов | джоб `build`, `ghcr.io/<owner>/<service>:sha-<commit>` |
| B5 блокировка при уязвимостях | `needs` у `build` + скан образа до пуша |
| C1 helm-чарты | [infra/helm/](infra/helm/): microservice, postgresql, monitoring |
| C2 blue-green | два Deployment и два Service, [deploy.sh](infra/scripts/deploy.sh) |
| C3 probes | `livenessProbe` на `/health`, `readinessProbe` на `/ready` |
| C4 автоматический rollback | три уровня, см. таблицу выше |
| C5 миграции | Helm hook Job + [migrate.js](orders-service/src/migrate.js) |
| D1 Prometheus и Grafana | [monitoring чарт](infra/helm/monitoring/) |
| D2 сбор логов | шаг сбора диагностики в артефакт при падении CD |
| D3 e2e после деплоя | [run.js](e2e/run.js) через preview Service до переключения |
| D4 rollback при падении e2e | ветка обработки ошибки в `deploy.sh`, режим `fail_mode` в CD |
| E1 Kubernetes Secrets | Secret из GitHub Secrets, проброс через `secretKeyRef` |
| E2 проверка секретов | gitleaks по всей истории, [.gitleaks.toml](.gitleaks.toml) |
| E3 запрет latest | `fail` в [_helpers.tpl](infra/helm/microservice/templates/_helpers.tpl) + проверка в CI |
| E4 RBAC | [rbac.yaml](infra/k8s/rbac.yaml) + деплой под этим ServiceAccount |
