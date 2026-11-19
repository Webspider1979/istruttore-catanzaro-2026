# App di studio ed esercitazione

Applicazione web locale per prepararsi al concorso da istruttore amministrativo-contabile del Comune di Catanzaro. Funziona senza connessione e senza installare nulla.

## Come si apre

### Sul computer

Fai doppio clic su `index.html`. Si apre nel browser predefinito e funziona subito, dati compresi.

### Sul telefono, senza computer acceso

Copia sul telefono il file unico `offline/istruttore-catanzaro-2026-offline.html`: contiene tutto, anche i 933 quesiti e le schede di studio. Si apre con Chrome e funziona senza rete.

Per aprirlo, dopo averlo copiato nella cartella *Download*, scrivi nella barra di Chrome:

```
file:///sdcard/Download/istruttore-catanzaro-2026-offline.html
```

Su alcune versioni di Android il browser non salva i progressi nelle pagine aperte da file system: l’app funziona lo stesso, ma statistiche e storico potrebbero non essere conservati. Se vuoi che restino, usa il server locale o una pubblicazione in HTTPS.

### Sul telefono, dal computer acceso sulla stessa rete

```
node work/js/serve.js
```

Il comando stampa l’indirizzo da usare, per esempio `http://192.168.0.10:4321`. Scrivilo nel browser del telefono: serve che telefono e computer siano sulla stessa rete e che Windows autorizzi Node.js per le reti private (la richiesta compare al primo avvio).

### Installarla come app vera

L’installazione come applicazione (icona nel menu, finestra senza barra del browser, cache offline gestita da `sw.js`) richiede che l’app sia servita in **HTTPS**: i browser non la propongono su `http://` di rete locale né sui file aperti da file system. Il progetto contiene già `manifest.webmanifest`, `sw.js` e l’icona: basta pubblicare la cartella `10_App` su un hosting statico con HTTPS perché Chrome mostri *Installa app*.

Senza pubblicare nulla si può comunque usare *Aggiungi a schermata Home* di Chrome su un indirizzo HTTPS: crea una scorciatoia con icona, che però apre una normale scheda del browser.

I progressi sono salvati dal browser e restano separati per ciascun modo di apertura: studiare sul telefono e sul computer significa avere due storici distinti.

## Le due sezioni

### Studio

Il programma è diviso in **14 unità** e **75 schede**. Ogni scheda ha la spiegazione distesa, i **punti cardine** da ripetere a voce e i riferimenti normativi puntuali. In alto c’è una ricerca che filtra le schede per parola (per esempio *soglie*, *silenzio assenso*, *FCDE*, *peculato*).

Da ogni scheda puoi partire con un’esercitazione limitata a quell’argomento: il pulsante **Allenati su questo argomento** imposta già il filtro.

Le schede che hai aperto restano segnate con un punto verde nell’indice.

Le 75 schede sono state rilette articolo per articolo il 19 novembre 2026: contengono asserzioni di diritto e non soltanto testo didattico, quindi sono state controllate sulle fonti come i quesiti. Gli otto rilievi emersi — fra cui un riferimento inesistente nel codice di comportamento e un’inversione sulla rotazione sottosoglia — sono corretti e documentati nel report di verifica del progetto.

### Esercitazione

Prima di ogni sessione scegli:

- **Quante domande**, da 1 a 33 — cursore, campo numerico o scorciatoie (1, 5, 10, 15, 20, 33).
- **Come sceglierle**:
  - *Struttura del bando* — mantiene le proporzioni della prova. A 33 domande è la simulazione completa: 20 tecniche, 7 situazionali, 3 di inglese, 3 di informatica, 30 punti, soglia 21/30. Con meno domande le proporzioni vengono mantenute il più possibile.
  - *Scelta libera* — tutte le materie o solo quelle selezionate, oppure il singolo argomento di studio.
  - *Solo i miei errori* — ripesca le domande sbagliate nelle sessioni precedenti.
- **Tempo limitato** — proporzionale alla prova vera: 50 minuti per 33 domande.
- **Priorità alle domande nuove** — prima quelle mai viste, poi quelle sbagliate.

Durante la sessione puoi muoverti fra le domande, cambiare risposta, lasciare in bianco con *Non rispondo* (nessuna penalità, come nel bando) e usare la tastiera: `A`–`D` o `1`–`4` per rispondere, frecce per spostarti.

### Resoconto

Alla fine della sessione trovi:

- il **punteggio** calcolato con le regole del bando (tecniche +1 / −0,33; inglese e informatica +0,50 / −0,165; situazionali 1 / 0,50 / 0) e, nella simulazione completa, l’esito rispetto alla soglia di 21/30;
- il conteggio di corrette, parziali, errate e non date;
- per ogni domanda sbagliata, lasciata in bianco o con punteggio parziale: **la tua risposta, quale sarebbe stata quella corretta, la spiegazione, l’articolo di riferimento**, il collegamento alla fonte normativa e il pulsante **Studia l’argomento →** che porta direttamente alla scheda di studio corrispondente;
- il pulsante **Rifai solo le sbagliate**.

Le risposte corrette restano consultabili in un blocco richiudibile.

### Andamento

Copertura e percentuale di risposte corrette per materia, storico delle sessioni, numero di errori ancora aperti. Tutto resta nel browser di questo dispositivo: non viene inviato nulla a nessun server. Il pulsante *Azzera i dati di studio* cancella statistiche e storico (chiede una conferma).

## File

```
10_App/
  index.html              pagina unica
  app.css                 stile, con tema chiaro e scuro
  app.js                  logica: studio, quiz, punteggi, resoconto, statistiche
  icon.svg                icona
  manifest.webmanifest    installazione come app
  sw.js                   cache offline (attiva solo via https o localhost)
  offline/                file unico autoportante, da copiare sul telefono
  artifact/               file unico per la pubblicazione come Artifact
  data/
    domande.json / .js    933 quesiti
    studio.json  / .js    14 unità, 75 schede
    bando.json   / .js    dati e regole del bando
```

I file `.js` servono perché l’app funzioni anche aperta da file system, dove il browser blocca `fetch()`; i `.json` hanno lo stesso contenuto e si usano per altre elaborazioni.

## Rigenerare i dati

I dati dell’app non si modificano a mano: si rigenerano dalle sorgenti.

```
node work/js/build.js
```

```
node work/js/build_studio.js
```

```
node work/js/build_artifact.js
```

Il primo ricostruisce il paniere dalla base immutabile `work/base/banca_dati_base_546.csv` più i blocchi in `work/js/blocchi/`, valida tutto (nessuna domanda duplicata, quattro opzioni piene, risposta valida, punteggi conformi al bando, fonte con URL, scheda di studio esistente) e riscrive CSV, database SQLite, manifest e dati dell’app. Il secondo rigenera le schede di studio e i dati del bando. Il terzo rigenera i due file unici, quello offline per il telefono e quello per l’Artifact: va rilanciato dopo ogni modifica, altrimenti restano indietro.

Per aggiungere domande basta creare o modificare un file in `work/js/blocchi/` e rilanciare `build.js`: gli identificativi vengono riassegnati in sequenza e la validazione blocca la generazione se qualcosa non torna.

## Avvertenze

I quesiti sono esercizi **originali**: il bando dichiara che non è prevista la pubblicazione di una banca dati ufficiale. Le fonti sono verificate al 18 novembre 2026; tutti i 933 quesiti e tutte le 75 schede sono poi stati riletti articolo per articolo, con le correzioni documentate nel report di verifica. Soglie, importi e clausole contrattuali vanno ricontrollati prima della prova: sono gli elementi che cambiano più spesso.
