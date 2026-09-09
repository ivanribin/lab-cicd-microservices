# Скриншоты по этапам работы

Один скриншот на каждый подпункт методички, от A1 до E4. Имя файла содержит номер
подпункта, поэтому на защите видно, что чем закрывается.

Обозначения статуса:

- **есть** - снимается прямо сейчас, всё готово
- **прогон 2** - нужен ручной запуск CD без `fail_mode`
- **прогон 3** - нужен ручной запуск CD с `fail_mode`
- **локально** - нужен Docker и `bash infra/scripts/kind-up.sh`

Постоянные ссылки:

- репозиторий: https://github.com/ivanribin/lab-cicd-microservices
- зелёный CI: [прогон 34376165898](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376165898)
- успешный CD: [прогон 34376411954](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376411954)

---

## Этап A - Подготовка репозитория

### `a1-repository.png` - создать репозиторий (есть)

Где: главная страница репозитория на GitHub.

В кадре: имя репозитория, ветки `main` и `development`, список коммитов.
Хорошо, если видно счётчик коммитов - история по этапам A-E.

### `a2-structure.png` - структура каталогов (есть)

Где: корень репозитория на GitHub либо дерево файлов в VS Code.

В кадре: каталоги `auth-service`, `orders-service`, `web-client`, `infra` -
ровно те четыре, что названы в задании.

### `a3-dockerfile-tests-readme.png` - Dockerfile, тесты и README (есть)

Где: VS Code с открытым `orders-service/Dockerfile` и развёрнутым `orders-service/test/`.

В кадре: multi-stage сборка, строка `USER 1000`, рядом файлы `app.test.js` и
`integration.test.js`. README виден в дереве.

### `a4-postgresql.png` - PostgreSQL (есть)

Где: [успешный CD](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376411954),
шаг `Install PostgreSQL`.

В кадре: успешная установка чарта. Альтернатива для локального прогона -
`kubectl -n lab get pod postgresql-0` со статусом `Running`.

---

## Этап B - CI: сборка и проверка

### `b1-lint-unit.png` - линтеры и unit-тесты (есть)

Где: [зелёный CI](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376165898),
джобы `Lint` и `Unit tests`.

В кадре: обе матрицы по двум сервисам зелёные. Можно раскрыть лог с итогом
`node --test` - числом пройденных тестов.

### `b2-integration.png` - интеграционные тесты (есть)

Где: тот же прогон, джоб `Integration tests`.

В кадре: раскрытый лог, где виден сервис-контейнер `postgres:16-alpine`, прогон
миграций и результат тестов. Важно, что база настоящая, а не мок.

### `b3-sast-sca.png` - security scan, SAST и SCA (есть)

Где: тот же прогон, джобы `SAST (CodeQL)` и `SCA (npm audit + Trivy)`.
Дополнительно https://github.com/ivanribin/lab-cicd-microservices/security/code-scanning

В кадре: оба джоба зелёные, плюс страница Code scanning с результатами CodeQL.

### `b4-build-push.png` - образы собраны и загружены в реестр (есть)

Где: джоб `Build and push` + https://github.com/ivanribin?tab=packages

В кадре: три пакета в GHCR с тегами вида `sha-42af804`. Обрати внимание -
ни одного тега `latest`, это же доказательство пригодится для E3.

### `b5-gate-blocks-cve.png` - запрет пуша при критических уязвимостях (есть)

Где: [красный прогон 34347366212](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34347366212)

В кадре: три красных джоба `Build and push`, в логе строка про CRITICAL CVE.

Ключевой скриншот этапа B: показывает, что гейт реально блокирует публикацию,
а не просто описан в YAML.

---

## Этап C - CD: развёртывание в Kubernetes

### `c1-helm-charts.png` - helm-чарты для сервисов (есть)

Где: дерево `infra/helm/` в VS Code либо джоб `Helm` в CI.

В кадре: чарты `microservice`, `postgresql`, `monitoring` и каталог `values`
с тремя файлами. Либо вывод `helm lint` и `helm template` из CI.

### `c2-bluegreen-switch.png` - стратегия blue-green (прогон 2)

Где: summary ручного прогона CD без `fail_mode`.

В кадре: блок `Blue-green switch` со строкой `Traffic moved from blue to green`
и таблица `Deployed state`, где orders-service имеет цвет `green`, а два других `blue`.

### `c3-probes.png` - readiness/liveness probes (есть)

Где: `infra/helm/microservice/templates/deployment.yaml` в VS Code.

В кадре: блоки `livenessProbe` на `/health` и `readinessProbe` на `/ready`.
Для локального прогона сильнее: `kubectl -n lab describe pod <под>` с секцией Liveness/Readiness.

### `c4-atomic-rollback.png` - автоматический rollback при ошибках (есть)

Где: [прогон 34358039730](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34358039730),
шаг `Blue-green deploy auth-service`.

В кадре: строка `release auth-service failed, and has been uninstalled due to atomic being set`.

Ценно тем, что откат сработал на настоящей ошибке конфигурации, а не на подстроенной.

### `c5-migrations.png` - миграции БД (есть)

Где: [успешный CD](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376411954),
Summary внизу страницы.

В кадре: блок `Applied migrations` со строками `applied 001_init.sql` и
`applied 002_add_status.sql`. Видно, что миграции идут Helm-хуком до старта подов.

---

## Этап D - Наблюдаемость и тестирование

### `d1-grafana.png` - Prometheus и Grafana (локально)

Где: http://localhost:3000, дашборд `Lab services overview`.

В кадре: четыре панели - RPS по сервисам, p95 задержки, доля 5xx, поды по цветам.

Если Docker не запускается, запасной вариант - шаг `Install Prometheus and Grafana`
в CD плюс конфигурация в `infra/helm/monitoring/`, но живой дашборд убедительнее.

### `d2-logs.png` - сбор логов (есть)

Где: [прогон 34358039730](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34358039730),
шаги `Collect diagnostics on failure` и `Upload diagnostics`, либо сам артефакт
`cluster-diagnostics` внизу страницы прогона.

В кадре: список собранных файлов - `describe-pods.txt`, `events.txt`, логи подов.

Артефакты живут 7 дней, логи прогона дольше. Если артефакт уже пропал, снимать сам шаг.

### `d3-e2e.png` - e2e-тесты после деплоя (есть)

Где: [успешный CD](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376411954),
шаг `Run e2e against the live services`.

В кадре: строка `e2e PASSED` и предшествующие шаги сценария - логин, создание
заказа, чтение.

### `d4-e2e-rollback.png` - rollback при падении e2e (прогон 3)

Где: summary красного прогона CD с `fail_mode`.

В кадре: строки `colour serving traffic before the broken release` и `after` с
**одинаковым** цветом, плюс красный статус прогона.

Красный прогон здесь - правильный результат: трафик не ушёл на сломанную версию.

---

## Этап E - Безопасность и политики

### `e1-secrets.png` - Kubernetes Secrets (есть)

Где: [успешный CD](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376411954),
шаг `Create application secrets from GitHub Secrets`.

В кадре: создание секрета, значения замаскированы звёздочками. Дополнительно можно
показать `.env.example` с плейсхолдерами и `envFromSecret` в чарте.

### `e2-gitleaks.png` - проверка секретов в коде (есть)

Где: [красный прогон 34353437184](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34353437184)

В кадре: красный джоб `Secret scan (gitleaks)`, строки `RuleID` и `leaks found: 3`.

Второй важный красный прогон: доказывает, что проверка секретов работает.

### `e3-no-latest.png` - запрет latest-тегов (есть)

Где: [зелёный CI](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376165898),
джоб `Policy checks`, оба шага раскрыты.

В кадре: `no latest tags found in infra/` и строки про числовой UID в каждом
Dockerfile. Дополняется скриншотом `b4` с тегами `sha-*` в реестре.

### `e4-rbac.png` - RBAC минимальных прав (есть)

Где: [успешный CD](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376411954),
шаг `Prove the deployer has no cluster-wide rights`.

В кадре: три строки - `create deployment in lab: yes`, `list nodes (cluster-wide): no`,
`create deployment in kube-system: no`.

---

## Сводка

| Статус | Скриншоты | Сколько |
|---|---|---|
| есть | a1-a4, b1-b5, c1, c3-c5, d2, d3, e1-e4 | 18 |
| прогон 2 | c2 | 1 |
| прогон 3 | d4 | 1 |
| локально | d1 | 1 |

Итого 21 файл на 22 подпункта: `b4` и `e3` частично опираются на один и тот же
вид реестра, потому что отсутствие тега `latest` доказывается там же, где и
успешная публикация образов.
