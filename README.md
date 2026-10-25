# MedTracker

[![CI](https://github.com/MarMen1713013/MedTracker/actions/workflows/ci.yml/badge.svg)](https://github.com/MarMen1713013/MedTracker/actions/workflows/ci.yml)
[![Docker release](https://github.com/MarMen1713013/MedTracker/actions/workflows/docker-release.yml/badge.svg)](https://github.com/MarMen1713013/MedTracker/actions/workflows/docker-release.yml)

Applicazione web personale per registrare farmaci, terapie e scorte, con notifiche ntfy e backup PostgreSQL automatici.

> Il progetto gestisce dati sanitari ed è ancora essenziale: usalo con cautela e non esporlo direttamente su Internet senza le protezioni indicate sotto.

## Avvio con Docker Compose

1. Copia `.env.example` in `.env`.
2. Imposta almeno `POSTGRES_PASSWORD` e `SECRET_KEY` con valori robusti.
3. Avvia lo stack:

   ```bash
   docker compose up -d --build
   ```

4. Apri `http://localhost:8000`. Le migrazioni Alembic vengono applicate automaticamente all'avvio.

Il primo utente registrato diventa amministratore. I dati PostgreSQL e i backup sono persistiti rispettivamente nei volumi `postgres_data` e `backups`.

Dalla **Dashboard**, il pulsante **Stampa riepilogo** permette di scegliere se includere le terapie attive dell'utente corrente, la disponibilità attuale dei farmaci oppure entrambe. La scelta apre un'anteprima che può essere stampata o salvata in PDF tramite la finestra di stampa del browser.

Ogni medicinale può avere un **dosaggio o una concentrazione** opzionale, per esempio `1000 mg` oppure `5 mg/ml`, separato dal nome e dal principio attivo. I nomi già presenti non vengono modificati automaticamente: valori come “Tachipirina 1000” possono essere sistemati manualmente dalla modifica del medicinale.

## Configurazione

| Variabile | Default | Uso |
| --- | --- | --- |
| `POSTGRES_DB` | `medtracker` | Database PostgreSQL |
| `POSTGRES_USER` | `medtracker` | Utente PostgreSQL |
| `POSTGRES_PASSWORD` | `changeme` | Password PostgreSQL; va cambiata |
| `SECRET_KEY` | valore insicuro di esempio | Firma dei token; va cambiata |
| `TZ` | `Europe/Rome` | Fuso orario dei job |
| `NTFY_URL` | vuoto | URL di un servizio ntfy esistente; vuoto disabilita le notifiche |
| `NOTIFICATION_HOUR` | `8` | Ora del controllo ntfy |
| `BACKUP_CRON_HOUR` | `2` | Ora del backup giornaliero |
| `BACKUP_RETENTION_DAYS` | `30` | Retention iniziale; `0` disabilita la pulizia |
| `AIFA_LOOKUP_ENABLED` | `true` | Abilita la ricerca online dei medicinali umani AIFA |
| `VETERINARY_LOOKUP_ENABLED` | `true` | Abilita la ricerca nell'archivio veterinario del Ministero della Salute |

La retention può essere modificata anche dall'interfaccia **Impostazioni**. Il valore salvato nel database prevale sulla variabile d'ambiente, viene letto a ogni esecuzione giornaliera e non richiede un riavvio. La pulizia conserva sempre il backup più recente.

La ricerca del principio attivo interroga online l'anagrafica AIFA completa per i medicinali umani, incluse le classi C e OTC, e l'open data giornaliero del Ministero della Salute per i medicinali veterinari. L'archivio veterinario viene mantenuto in memoria per 24 ore; al primo utilizzo il download può richiedere qualche secondo. Il container deve poter raggiungere via HTTPS `api.aifa.gov.it` e `www.dati.salute.gov.it`. Se una fonte non è disponibile, le altre continuano a funzionare e il principio attivo resta sempre compilabile manualmente.

## Immagine di release

Per usare un'immagine già pubblicata:

```bash
DOCKER_IMAGE=marmen1713013/medtracker:latest docker compose -f docker-compose.release.yml up -d
```

## CI e pubblicazione su Docker Hub

La workflow **CI** parte a ogni push su `master` e a ogni pull request. Esegue i test backend, compila il frontend e costruisce l'immagine Docker senza pubblicarla. Il badge in cima al README mostra l'esito dell'ultima esecuzione sul branch principale.

La workflow **Docker release** parte solo quando viene pubblicato un tag stabile nel formato `vMAJOR.MINOR.PATCH`, per esempio `v1.2.0`. Prima richiama l'intera CI; soltanto se tutti i controlli passano costruisce l'immagine per `linux/amd64` e `linux/arm64` e la invia a `marmen1713013/medtracker` con questi tag:

- il tag Git completo, per esempio `v1.2.0`;
- gli alias di serie, per esempio `1.2` e `1`;
- `latest`.

Per autorizzare la pubblicazione, configura in **GitHub > repository MedTracker > Settings > Secrets and variables > Actions**:

- la variabile `DOCKERHUB_USERNAME` con valore `marmen1713013`;
- il secret `DOCKERHUB_TOKEN` con un personal access token Docker Hub dotato di permesso di lettura e scrittura.

Il token Docker Hub è necessario anche se l'account Docker Hub usa GitHub per il login: non va usata né salvata la password dell'account. La workflow può anche essere avviata manualmente dalla scheda **Actions**, indicando un tag già esistente; questa modalità è pensata per recuperare o ripetere una pubblicazione, senza compilare codice diverso da quello puntato dal tag.

Per una nuova release:

```bash
git tag -a v1.2.0 -m "MedTracker v1.2.0"
git push origin v1.2.0
```

L'architettura di deploy attuale (un container applicativo più PostgreSQL) resta adatta a un'installazione personale e a singola istanza. Non aumentare le repliche del container `app`: lo scheduler è incorporato nel processo e più repliche eseguirebbero backup, consumo terapie e notifiche più volte. Per scalare, i job andrebbero separati in un worker dedicato.

Le dipendenze frontend sono bloccate nel lockfile e le immagini usano `npm ci`, così build locali e release installano lo stesso albero di pacchetti.

Prima di un'esposizione pubblica sono raccomandati:

- reverse proxy con HTTPS e limiti di accesso;
- disabilitazione o protezione della registrazione dopo la creazione dell'utente iniziale;
- revisione del modello multiutente: farmaci, scorte, impostazioni e operazioni di backup sono condivisi e non sono attualmente limitati agli amministratori;
- backup off-site del volume `backups`, perché un volume sullo stesso host non protegge dal guasto dell'host;
- monitoraggio di `/api/health` e dello spazio disponibile;
- una strategia esplicita di aggiornamento e rollback dell'immagine.

La porta `8000` è pubblicata dall'attuale Compose. Per un'installazione solo locale può essere vincolata a loopback (`127.0.0.1:8000:8000`) o rimossa quando l'app è raggiunta esclusivamente tramite reverse proxy.

## Backup e ripristino

I backup compressi sono salvati in `/backups`. Contengono farmaci e movimenti di scorta; non sono quindi un backup completo di utenti, impostazioni e terapie. Il ripristino svuota le terapie per evitare riferimenti incoerenti. I file possono essere creati, importati, scaricati, ripristinati ed eliminati dalla pagina **Backup**.

La retention giornaliera riguarda tutti i file di backup riconosciuti nella directory. Il file più recente non viene eliminato anche quando gli altri risultano scaduti.
