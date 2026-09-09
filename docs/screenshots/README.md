# Скриншоты

Список того, что нужно приложить к отчёту, и откуда это брать. Имена файлов
используются в ссылках из [README](../../README.md) и [architecture.md](../architecture.md).

## Из GitHub Actions

| Файл | Что снять | Где взять |
|---|---|---|
| `01-ci-green.png` | успешный прогон CI с графом джобов | Actions, workflow CI, любой зелёный прогон |
| `02-ci-security-gate.png` | прогон, где `build` заблокирован из-за CRITICAL CVE | Actions, красный прогон CI от 09.09 |
| `03-security-tab.png` | результаты CodeQL | вкладка Security, Code scanning alerts |
| `04-ghcr-packages.png` | три образа с тегами `sha-*`, без `latest` | страница профиля, вкладка Packages |
| `05-cd-initial.png` | summary первого деплоя: все сервисы на `blue` | Actions, CD, прогон после мержа |
| `06-cd-bluegreen.png` | summary переключения `blue` в `green` | Actions, CD, ручной прогон |
| `07-cd-rollback.png` | красный прогон: e2e упали, цвет не сменился | Actions, CD, прогон с `fail_mode` |
| `08-rbac-proof.png` | шаг `Prove the deployer has no cluster-wide rights` | любой успешный прогон CD |

Самые важные для оценки - `06` и `07`: они показывают стратегию деплоя и
автоматический откат, то есть 20% оценки, которые нельзя подтвердить кодом.

## Из локального кластера

Требуется запущенный Docker и `bash infra/scripts/kind-up.sh`.

| Файл | Что снять | Где взять |
|---|---|---|
| `09-app.png` | страница с логином и списком заказов | http://localhost:8080 |
| `10-grafana.png` | дашборд с четырьмя панелями | http://localhost:3000, дашборд Lab services overview |
| `11-grafana-bluegreen.png` | панель Scraped pods by colour в момент переключения | там же, во время `deploy.sh` |
| `12-kubectl.png` | поды и активные цвета | вывод команд ниже |

```bash
kubectl -n lab get pods -o wide
kubectl -n lab get svc -o custom-columns=NAME:.metadata.name,COLOR:.spec.selector.color
kubectl -n lab logs job/orders-service-migrate
```

Последняя команда показывает применённые миграции - это подтверждение для
пункта 8 чек-листа.
