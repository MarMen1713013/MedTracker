# MedTracker

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
| `AIFA_LOOKUP_ENABLED` | `true` | Abilita la ricerca del principio attivo negli elenchi AIFA |

La retention può essere modificata anche dall'interfaccia **Impostazioni**. Il valore salvato nel database prevale sulla variabile d'ambiente, viene letto a ogni esecuzione giornaliera e non richiede un riavvio. La pulizia conserva sempre il backup più recente.

La ricerca AIFA consulta gli elenchi ufficiali dei farmaci di classe A e H e mantiene una cache in memoria per 24 ore. Richiede accesso HTTPS in uscita verso `www.aifa.gov.it`; se il servizio non è disponibile, il principio attivo resta compilabile manualmente.

## Immagine di release

Per usare un'immagine già pubblicata:

```bash
DOCKER_IMAGE=tuoutente/medtracker:latest docker compose -f docker-compose.release.yml up -d
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
