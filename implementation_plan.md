# Pla d'Implementació: Càlcul i Enviament Híbrid a WhatsApp (Sense Emmagatzematge Permanent)

Aquest pla dissenya una solució elegant i 100% flexible que compleix tots els teus requisits:
1. **Dades 100% a la URL**: Ni les coordenades, ni els telèfons, ni la clau API es guarden permanentment en el repositori o codi (privacitat total).
2. **Multitelèfon**: Admet enviar la notificació a múltiples telèfons de manera simultània.
3. **Enviament 100% Automàtic**: Sense botons ni pantalles interactives.
4. **Compatible amb Cronjob**: Executable de forma nativa des d'un cronjob a macOS mitjançant la comanda `open`.

---

## 🛠️ Com funciona l'Arquitectura Híbrida

Crearem una pàgina **HTML + JS** minimalista (que pots obrir localment o penjar a **GitHub Pages**).

Quan s'obre la URL de l'aplicació, el JavaScript:
1. Llegeix les coordenades de la URL (`route`).
2. Llegeix un o més telèfons separats per comes de la URL (`phone`).
3. Llegeix l'apikey de CallMeBot de la URL (`apikey`).
4. Consulta el temps a l'API pública de **OSRM**.
5. Executa crides de xarxa silencioses en segon pla (`fetch`) per a cada telèfon cap a **CallMeBot**:
   `https://api.callmebot.com/whatsapp.php?phone={telefon}&text={missatge}&apikey={apikey}`
6. Mostra en pantalla el resum de l'enviament finalitzat amb èxit.

### Estructura de la URL requerida:
```text
file:///Users/eduard.vallve/Projects/Coding/traffic-notifier/index.html?route=1.259291,41.138855;1.093890,41.152719&phone=34600000000,34611111111&apikey=987654
```

---

## ⏱️ Com es configura el Cronjob a Mac?

Per automatitzar l'enviament diari sense haver de fer res:
1. Edita el teu crontab executant: `crontab -e`
2. Afegeix la línia indicant l'hora (per exemple, cada dia a les 08:30 AM):
   `30 8 * * 1-5 open "file:///Users/eduard.vallve/Projects/Coding/traffic-notifier/index.html?route=1.259291,41.138855;1.093890,41.152719&phone=34600000000,34611111111&apikey=EL_TEU_APIKEY"`
3. A l'hora desitjada, el cronjob llançarà la comanda `open` que obrirà el teu navegador predeterminat amb aquesta URL. El navegador calcularà la ruta, farà l'enviament silenciós en segon pla a tots els números de WhatsApp i finalitzarà!

---

## Canvis Proposats

### [Component: Headless Web Multiplexora]

#### [MODIFY] [index.html](file:///Users/eduard.vallve/Projects/Coding/traffic-notifier/index.html)
- Disseny simple de càrrega fosc/elegant.
- Mostrarà els estats en directe: `Calculant ruta...`, `Enviant missatges...` i finalment `Completat correctament!`.

#### [MODIFY] [app.js](file:///Users/eduard.vallve/Projects/Coding/traffic-notifier/app.js)
- Llegirà els paràmetres de la URL: `route`, `phone` (com a llista separada per comes) i `apikey`.
- Si falta algun paràmetre indispensable, mostrarà immediatament a la pantalla les instruccions en vermell per indicar com s'ha de construir la URL.
- Processarà en paral·lel (`Promise.all`) les peticions asíncrones a l'API de CallMeBot per a tots els telèfons sans (sanejats automàticament de caràcters incorrectes).
- Mostrarà a la pantalla de la pàgina el missatge d'èxit final quan tots s'hagin enviat.

---

## Verificació

### Proves Manuals
1. **Comprovació de validació**: Obrir la URL sense algun paràmetre (ex: sense `apikey`) i veure que l'aplicació s'atura i demana el paràmetre.
2. **Comprovació de múltiple telèfon**: Executar la URL amb 2 telèfons i la clau, verificant a la consola del navegador que es fan les crides HTTP GET pertinents a CallMeBot i que el resultat és "Completat".
