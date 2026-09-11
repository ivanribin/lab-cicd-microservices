# Статус работы и где искать доказательства

Живой чеклист сдачи. Обновляется по мере продвижения.
Репозиторий: https://github.com/ivanribin/lab-cicd-microservices

## Готово и подтверждено прогонами

| Пункт | Доказательство | Ссылка |
|---|---|---|
| CI зелёный, все джобы | прогон CI на `main` | [34376165898](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376165898) |
| B5: гейт блокирует пуш при CRITICAL CVE | все три `Build and push` красные, образы в GHCR не попали | [34347366212](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34347366212) |
| E2: gitleaks ловит секрет | джоб `Secret scan` красный | [34353437184](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34353437184) |
| C4 уровень 1: `--atomic` откат | поды не прошли readiness, Helm откатил релиз сам | [34358039730](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34358039730) |
| CD полный цикл, e2e PASSED | развёртывание всех сервисов, миграции, e2e | [34376411954](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34376411954) |
| E4: RBAC реально ограничен | шаг `Prove the deployer has no cluster-wide rights` в summary | там же |
| C5: миграции применяются хуком | блок `Applied migrations` в summary | там же |
| D1: Prometheus и Grafana развёрнуты | шаг `Install Prometheus and Grafana` | там же |
| C2: переключение blue-green | e2e прошли против `orders-service-preview`, затем трафик перешёл `blue` в `green` | [34378646260](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34378646260) |
| C4 уровень 2 + D4: откат по падению e2e | e2e упали против `green`, откат вернул `blue`, цвет до и после совпал | [34580277531](https://github.com/ivanribin/lab-cicd-microservices/actions/runs/34580277531) |

## Осталось получить

| Пункт | Что сделать | Статус |
|---|---|---|
| D1: живой дашборд Grafana | локально `bash infra/scripts/kind-up.sh`, http://localhost:3000 | нужен Docker |
| Скриншот приложения | там же, http://localhost:8080 | нужен Docker, необязательный |

Все подпункты от A1 до E4 подтверждены прогонами. Осталась только живая Grafana:
её развёртывание видно в логах CD, но дашборд с данными нужно снять из кластера.

## Про сроки: что успеть, а что не убежит

**Не торопясь (90 дней):** логи и summary всех прогонов Actions. Скриншоты из
таблицы «Готово» можно снять в любой момент до сдачи, они никуда не денутся.

**Успеть за 7 дней:** артефакты `cluster-diagnostics` удаляются по
`retention-days: 7` в [cd.yml](../.github/workflows/cd.yml). Если диагностика
упавшего деплоя нужна в отчёте, скачать её нужно в течение недели после прогона.
Для отчёта это скорее приятное дополнение: сам факт отката виден в summary и логах,
которые живут дольше.

**Практичнее всего:** снять все скриншоты одним заходом после прогонов 2 и 3,
по списку в [screenshots/README.md](screenshots/README.md).

## Куда возвращаться

| Файл | Что содержит |
|---|---|
| этот файл | статус работы и ссылки на прогоны-доказательства |
| [README.md](../README.md) | описание проекта и разбор по всем 7 критериям оценки |
| [docs/architecture.md](architecture.md) | как устроен blue-green, три уровня отката, схемы |
| [docs/screenshots/README.md](screenshots/README.md) | список скриншотов и откуда их брать |

## Порядок оставшихся шагов

1. PR из `development` в `main` с коммитом `42a39b8`, мерж
2. CD вручную, `fail_mode` выключен: получить переключение blue в green
3. CD вручную, `fail_mode` включён: получить откат, прогон будет красным (это норма)
4. Запустить Docker, `bash infra/scripts/kind-up.sh`, снять приложение и Grafana
5. Снять остальные скриншоты по списку, положить в `docs/screenshots/`
