# Browse auf Basis der Timeline

## Status

Konzeptentwurf für eine schrittweise Implementierung. Dieses Dokument setzt den Entwurf [Benutzerbezogener Blob-Katalog und Medien-Timeline](2026-08-02-user-blob-catalog-design.md) fort und beschreibt, wie die katalogbasierte Timeline die bisherige Browse-Ansicht vollständig ersetzt.

Es korrigiert dabei eine Aussage des Vorgängerdokuments. Dort hieß es unter *Technische Ansichten*, die bestehende Blobliste und die Relationship-Ansicht blieben als Diagnoseansichten erhalten. Diese Entscheidung wird zurückgenommen: Die Timeline bildet beide Aufgaben inzwischen selbst ab, und zwei parallele Browse-Modelle nebeneinander zu pflegen ist nicht gewollt.

## Problem

Browse ist heute serverzentriert. Der Benutzer wählt zuerst einen Server, erhält dessen `BlobDescriptor`-Liste und arbeitet anschließend auf einzelnen Hashes. Daraus folgen mehrere Schwächen:

- Ohne Serverauswahl zeigt die Seite gar nichts, obwohl der Katalog den gesamten Benutzerkontext kennt.
- Ein logisches Medium zerfällt in viele Einträge. Ein HLS-Video erscheint als Playlist plus Dutzende Segmente.
- Derselbe Blob auf drei Servern ist entweder dreimal sichtbar oder nur im Kontext eines Servers.
- Die technische Blob-Ebene bestimmt die primäre Navigation, obwohl der Benutzer in Medien denkt.
- Vier weitgehend redundante Darstellungsmodi (Gallery, Video, Audio, Docs) bilden lediglich einen Typfilter nach, den die Timeline bereits besitzt.

Die katalogbasierte Timeline löst diese Punkte bereits, existiert bisher aber als zweiter, paralleler Navigationspunkt.

## Zielbild

Die Timeline wird die primäre Oberfläche zum Entdecken, Prüfen und Verwalten von Assets und übernimmt die Route `/browse`. Die bisherige Blobliste ist danach kein eigenständiges Hauptmodell mehr. Ihre praktischen Aufgaben — dichte Übersicht, Mehrfachauswahl, Löschen, Serververwaltung — leben als Listenmodus und Aktionen innerhalb von Browse weiter.

Leitende Gestaltungsprinzipien:

- Event- und assetzentriert statt dateizentriert.
- Weniger sichtbare Steuerung; progressive Offenlegung für seltene Funktionen.
- Medienansicht für Orientierung und Kontext, Listenansicht für Details und Aktion.
- Technische Blob-Komplexität bleibt im Detail, nicht auf der primären Browse-Fläche.

## Nicht-Ziele

- Kein neues Datenmodell. Browse konsumiert ausschließlich vorhandene `TimelineProjection`-Daten.
- Keine Änderung an Discovery, Enrichment oder Verfügbarkeitsprüfung.
- Keine Migration von `Transfer.tsx`. Diese Seite nutzt `BlobList` weiterhin und bleibt vorerst blobzentriert.
- Keine Ausführung von Mirror und Sync in diesem Schritt (siehe [Aktionen](#aktionen)).

## Datenbasis

Browse arbeitet auf `TimelineProjection` aus `src/catalog/advanced.ts`. Ein Asset bündelt:

- das zugehörige Nostr-Event und seinen Kontext (`eventId`, `eventKind`, `eventAuthor`, `eventAddress`);
- das primäre Medium (`primaryBlobSha256`, `primaryUrl`);
- Vorschau und Rollen wie Thumbnail oder Rendition (`previewBlobSha256`, `previewUrl`, `TimelineAssetBlob.role`);
- Anzahl und Gesamtgröße zugehöriger Blobs (`blobCount`, `totalBlobSize`, `unknownBlobSizeCount`);
- Repliken und Verfügbarkeitsstatus (`replicaCount`, `availabilityState`);
- Datum, Titel und Beschreibung (`displayDate`, `displayDateSource`, `displayTitle`, `displaySubtitle`).

Technische HLS-Segmente erscheinen nicht als eigene Browse-Einträge. `projectCatalogAssets` bündelt sie über `collectDescendants` als Renditions des Playlist-Assets; `queryCatalogTimeline` filtert Projektionen heraus, deren primärer Hash bereits von einem Event-Asset referenziert wird.

Blobs ohne Event bleiben sichtbar. Die Projektion legt für sie ein Asset mit `identityType: 'root-blob'` an. Damit deckt die Assetliste den vollständigen Benutzerkontext ab, und kein Blob wird durch den Wechsel des Browse-Modells unerreichbar.

## Ansichten

Beide Ansichten teilen sich Datenbasis, Filter, Suche, Auswahl und Navigationskontext. Der Umschalter verändert ausschließlich die Darstellung.

### Medienansicht

Entspricht der bestehenden Timeline-Darstellung:

- ein Eintrag pro Asset in einem responsiven Raster;
- repräsentatives Thumbnail — Bild, Videovorschau, bei Audio das Cover;
- ruhige Informationshierarchie aus Titel, kurzer Beschreibung und wenigen Metadaten;
- Metadatenzeile mit Typ, Datum, Verfügbarkeit, Blob-Anzahl, Größe und Repliken;
- monatliche Gruppierung mit `TimelineNavigation` als Monatsleiste;
- Sortierung fest chronologisch absteigend;
- Öffnen eines Assets führt in die Detailansicht.

### Listenansicht

Ergänzt die Medienansicht für dichte Übersicht und technische Arbeit:

- Karten-Zeilen statt Raster: Asset-Thumbnail und Kernmetadaten links, zugehörige Blob- und Rolleninformationen kompakt rechts;
- rechte Spalte zeigt bis zu vier Blobs mit Hash, Rolle, MIME-Type, Größe und Replikatzahl, darunter `+N weitere`;
- freie Sortierung (siehe unten), dadurch **keine** Monatsgruppierung und keine Monatsleiste;
- das Asset bleibt die visuelle Einheit; Blobs sind Detailinformation, kein zweites Browse-Modell;
- HLS bleibt als Playlist-Asset zusammengefasst.

Als Referenz dient die Umsetzung im Prototyp-Worktree `/Users/flox/.codex/worktrees/749e/bouquet` (`BlobSummary` in `src/pages/Timeline.tsx`).

## Sortierung

Sortierung und Monatsgruppierung schließen einander aus, sobald nicht nach Datum sortiert wird. Auflösung:

| Ansicht | Sortierung | Gruppierung | Monatsleiste |
|---|---|---|---|
| Medienansicht | fest `displayDate` absteigend | nach Monat | sichtbar |
| Listenansicht | frei wählbar | keine | ausgeblendet |

Sortierkriterien der Listenansicht: Datum, Titel, Gesamtgröße, Blob-Anzahl, Replikatzahl — jeweils auf- und absteigend. Bei Sortierung nach Größe zählen Assets mit `unknownBlobSizeCount > 0` als untere Schranke und werden entsprechend gekennzeichnet.

Der Wechsel zurück in die Medienansicht stellt die chronologische Reihenfolge und die Gruppierung wieder her, ohne die gewählte Listensortierung zu verwerfen.

## Bedienung

Eine kompakte Leiste oberhalb der Ansicht enthält:

1. **Umschalter** Medienansicht / Listenansicht
2. **Suche** über `searchText`
3. **Sortierung** (nur in der Listenansicht aktiv)
4. **Server-Kontext** (optional)
5. **Filter** für seltenere Kriterien, hinter einem Menü
6. **Kontextaktionen** Mirror, Sync und Löschen

Filter, Auswahl, Suche, Sortierung und Scroll-Anker bleiben beim Umschalten der Darstellung erhalten. Der bestehende `sessionStorage`-Mechanismus (`bouquet:timeline:<key>`) wird um `displayMode`, `sort` und `serverId` erweitert.

### Filter und Voreinstellungen

Browse ist eine Verwaltungsoberfläche. Per Default ist deshalb **nichts** ausgeblendet:

| Filter | Default | Ort |
|---|---|---|
| Typ (`all`, `media`, image, video, audio, document, unknown) | `all` | Leiste |
| Server-Kontext | keiner | Leiste |
| Nur Assets mit Nostr-Event (`eventOnly`) | aus | Filtermenü |
| Nur beschreibende Titel (`descriptiveOnly`) | aus | Filtermenü |
| Verfügbarkeit (`complete`, `partial`, `unavailable`, `unknown`) | keiner | Filtermenü |

Das ist eine bewusste Abkehr von den bisherigen Timeline-Defaults (`typeFilter='media'`, `descriptiveOnly=true`). Als kuratierte Timeline war das Ausblenden sinnvoll; als einzige Browse-Fläche hätte es zur Folge, dass eigene Dateien ohne Event-Metadaten unsichtbar und damit unverwaltbar wären.

### Server-Kontext

Der Server-Kontext ist ein Filter: sichtbar bleiben alle Assets, von denen **mindestens ein Blob** auf dem gewählten Server als `present` beobachtet wurde. Das entspricht am ehesten dem bisherigen serverzentrierten Browse und bleibt für teilweise verteilte Assets brauchbar — ein HLS-Video mit 40 von 60 Segmenten auf einem Server bleibt auffindbar.

Verfügbarkeitsanzeige, Größe und Replikatzahl bleiben absolut, also serverübergreifend. Ein aktiver Server-Kontext ändert nur, *welche* Assets erscheinen, nicht *wie* sie bewertet werden.

Implementierungshinweis: `TimelineProjection` kennt bisher nur `replicaCount`, keine Serverzuordnung. `queryCatalogTimeline` erhält daher einen optionalen `serverId`-Parameter und joint bei aktivem Filter über `asset_blob` und `blob_location`. Ein denormalisiertes Feld `serverIds` in `timeline_projection` bleibt als spätere Optimierung möglich, ist bei der erwarteten Größenordnung aber nicht nötig und erspart eine Schema-Migration.

### Serververwaltung

Die Serververwaltung bleibt erhalten. `ServerListPopup` wird heute ausschließlich aus `Home.tsx` und `ServerList.tsx` geöffnet; entfiele `Home`, ließen sich keine Server mehr hinzufügen.

Der Einstiegspunkt wandert in die Browse-Bedienleiste neben den Server-Kontext-Selektor. Damit stehen Auswahl und Verwaltung von Servern räumlich zusammen.

## Auswahl und Aktionen

### Mehrfachauswahl

Mehrfachauswahl bleibt erhalten, arbeitet aber auf **Assets** statt auf Blobs:

- Auswahl in beiden Ansichten möglich, primär in der Listenansicht;
- Shift-Klick für Bereiche, analog zum bestehenden `useBlobSelection`;
- „Alle sichtbaren auswählen" bezieht sich auf die aktuell gefilterte Menge;
- eine Aktionsleiste erscheint, sobald mindestens ein Asset ausgewählt ist, und zeigt Anzahl, Gesamtgröße und Summe der betroffenen Blobs.

### Aktionen

`planCatalogAction` in `src/catalog/advanced.ts` **plant** heute nur: es liefert `{ allowed, reason, targets, presentTargets }` und führt nichts aus. Die tatsächliche Ausführung gegen Blossom- und NIP-96-Server ist ein eigenes Arbeitspaket und wird hier spezifiziert, aber nicht in diesem Schritt umgesetzt.

**In diesem Schritt umgesetzt:**

- Löschen. Die dafür nötige Serverlogik existiert bereits in `Home.tsx` (`deleteBlobAcrossServers`, `createDeleteAuth`, `deleteNip96File`) und im `DeleteProgressDialog`. Sie wird nach Browse übernommen und auf Asset-Granularität gehoben: gelöscht werden alle Blobs eines Assets, nicht ein einzelner Hash.
- Planvorschau für alle drei Aktionen. Vor jeder Aktion zeigt ein Dialog exakt, welche Blobs auf welchen Servern betroffen sind, und blockiert bei `allowed: false` mit der von `planCatalogAction` gelieferten Begründung.

**Spezifiziert, aber Folgeschritt:**

- **Mirror**: kopiert fehlende Blobs eines Assets von einer vorhandenen Quellreplik auf einen Zielserver. `planCatalogAction` liefert mit `presentTargets` bereits die übertragbaren Quellen und blockiert, wenn keine verfügbar ist. Offen sind Zielserverauswahl, Fortschritt pro Blob und Wiederaufnahme nach Abbruch.
- **Sync**: gleicht ein Asset über alle konfigurierten Server hinweg ab, bis jeder Blob überall vorliegt. Baut vollständig auf Mirror auf.

Beide erhalten dieselbe Planvorschau und denselben Fortschrittsdialog wie das Löschen, sodass die Oberfläche jetzt schon dafür ausgelegt wird.

### Schutzregeln

Die bestehenden Regeln aus `planCatalogAction` gelten unverändert und werden in der Oberfläche sichtbar gemacht:

- Löschen erfordert einen vollständigen, eindeutigen Asset-Graphen. Bei Beziehungen im Zustand `unresolved`, `failed` oder `truncated` ist die Aktion blockiert.
- Mirror erfordert mindestens eine übertragbare Quellreplik, die nicht `native-url` ist.
- Bei Mehrfachauswahl wird pro Asset geplant. Blockierte Assets werden mit Begründung ausgewiesen und übersprungen; die übrigen laufen durch.

## Skalierung

Erwartete Größenordnung: Hunderte bis rund 2.000 Assets.

Daraus folgt:

- Die Listenansicht wird virtualisiert. Nur sichtbare Zeilen werden gerendert.
- Blob-Details werden ausschließlich für den sichtbaren Bereich nachgeladen, ausgelöst über einen `IntersectionObserver`, mit begrenzter Nebenläufigkeit und Cache pro `assetId`.
- Keine Pagination. Sie war im blobzentrierten Modell nötig, weil ein HLS-Video Dutzende Zeilen erzeugte; auf Asset-Ebene entfällt der Grund.
- `queryCatalogTimeline` darf weiterhin vollständig im Speicher sortieren und filtern. Ein Paging bis in den Katalog hinein wird erst oberhalb dieser Größenordnung nötig.

Der Prototyp löst dies noch nicht: Er ruft `getCatalogTimelineAsset` beim Umschalten für **jedes** gefilterte Item parallel auf. Bei 2.000 Assets sind das 2.000 IndexedDB-Roundtrips in einem Schwung. Das ist der wesentliche Punkt, an dem die Umsetzung über den Prototyp hinausgehen muss.

## Routen und Navigation

| Route | Vorher | Nachher |
|---|---|---|
| `/browse` | `Home` | `Timeline` |
| `/browse/:assetId` | — | `TimelineAssetDetail` |
| `/timeline` | `Timeline` | Redirect auf `/browse` |
| `/timeline/:assetId` | `TimelineAssetDetail` | Redirect auf `/browse/:assetId` |

Der Navigationspunkt „Timeline" entfällt in `TopNav`; „Browse" bleibt und zeigt auf die neue Ansicht. Die Redirects bleiben dauerhaft bestehen, damit gespeicherte Links und Lesezeichen weiter funktionieren.

Der Prototyp lässt `/timeline/:assetId` noch parallel auf dieselbe Komponente zeigen. Sauberer ist ein Redirect, damit es nur eine kanonische URL pro Asset gibt.

## Codeauswirkungen

### Entfällt

| Datei | Begründung |
|---|---|
| `src/pages/Home.tsx` | vollständig ersetzt; Löschlogik wandert nach Browse |
| `src/components/ImageBlobList/` | Gallery-Modus entfällt, ersetzt durch Typfilter |
| `src/components/VideoBlobList/` | dito |
| `src/components/AudioBlobList/` | dito |
| `src/components/DocumentBlobList/` | dito |
| `src/components/BlobList/RelationshipTree.tsx` | Beziehungsgraph ist in der Timeline implizit neu umgesetzt |
| `src/utils/blobRelationshipGraph.ts`, `useBlobRelationshipGraph` | nur noch vom RelationshipTree genutzt |
| `src/components/BlobList/BlobListTypeMenu.tsx` | Modusmenü ohne Modi |

Die Löschung von `blobRelationshipGraph.ts` steht unter Vorbehalt: Die Beziehungsregeln sind laut Vorgängerdokument schrittweise hinter das Katalog-Modul zu verlagern. Vor dem Entfernen ist zu prüfen, ob `src/catalog/` alle dort kodierten Regeln bereits abdeckt.

### Bleibt

| Datei | Begründung |
|---|---|
| `src/components/BlobList/BlobList.tsx` | weiterhin von `Transfer.tsx` genutzt |
| `src/components/BlobList/DeleteProgressDialog.tsx` | wird von Browse übernommen |
| `src/components/BlobList/useBlobSelection.ts` | Grundlage der Asset-Mehrfachauswahl |
| `src/components/ServerListPopup/` | Serververwaltung, neuer Einstiegspunkt in Browse |
| `src/components/ServerList/ServerSelect.tsx` | Server-Kontext-Selektor |

`BlobList` behält damit vorerst Existenzberechtigung, aber nur noch für Transfer — nicht mehr als Browse-Modell.

### Wird erweitert

- `src/pages/Timeline.tsx`: Umschalter, Sortierung, Server-Kontext, Filtermenü, Mehrfachauswahl, Aktionsleiste, Virtualisierung.
- `src/catalog/advanced.ts`: `queryCatalogTimeline` erhält `serverId` und Sortierparameter.
- `src/components/Layout/TopNav.tsx`: Timeline-Eintrag entfernen.
- `src/main.tsx`: Routing und Redirects.

Angesichts des Umfangs ist `Timeline.tsx` (bereits 559 Zeilen) aufzuteilen. Vorschlag: Bedienleiste, Medienraster, Listenansicht, Auswahl-/Aktionsleiste als eigene Komponenten unter `src/components/Browse/`, mit der Seite als reinem Zustandshalter.

## Getroffene Annahmen

Diese Punkte waren nicht Teil der Konzeptvorgabe und wurden hier entschieden. Sie sind bewusst leicht revidierbar:

1. **Hash-Suche.** Das Suchfeld matcht zusätzlich sha256-Präfixe ab acht Zeichen gegen alle Blobs eines Assets. Ohne das lässt sich die Frage „liegt Blob X noch irgendwo?" nach dem Wegfall der Blobliste nicht mehr beantworten. Erfordert eine Erweiterung von `searchText` oder einen separaten Suchpfad in `queryCatalogTimeline`.
2. **Detailansicht.** `TimelineAssetDetail` wird in diesem Schritt nur an die neuen Routen und Aktionen angepasst, nicht inhaltlich überarbeitet. Ihre Gestaltung bleibt Gegenstand des Vorgängerdokuments.
3. **Kopieren der URL.** Die Aktion aus der alten Blobliste bleibt erhalten, wandert aber auf Blob-Ebene in die Detailansicht und in die aufgeklappte Blob-Zusammenfassung der Listenansicht.
4. **Refresh.** Der manuelle Refresh-Button entfällt. Browse reagiert bereits auf `bouquet-catalog-changed` und projiziert bei Änderungen des Katalogstatus neu.

## Akzeptanzkriterien

1. `/browse` zeigt ohne jede Serverauswahl den vollständigen Assetbestand des angemeldeten Pubkeys.
2. Ein HLS-Video erscheint als genau ein Eintrag; seine Segmente sind nur in der Blob-Zusammenfassung und der Detailansicht sichtbar.
3. Ein Blob ohne Nostr-Event erscheint bei Default-Filtern als eigenes Asset und ist löschbar.
4. Der Wechsel zwischen Medien- und Listenansicht erhält Suche, Filter, Server-Kontext, Auswahl und Scrollposition.
5. Die Medienansicht ist chronologisch nach Monaten gruppiert; die Listenansicht sortiert frei und zeigt keine Monatsgruppen.
6. Bei aktivem Server-Kontext erscheinen genau die Assets mit mindestens einem `present`-Blob auf diesem Server.
7. Mehrfachauswahl und Löschen mehrerer Assets funktionieren inklusive Planvorschau, Fortschritt und Fehlerbericht pro Server.
8. Löschen ist bei unvollständigem Asset-Graphen mit sichtbarer Begründung blockiert.
9. Die Serververwaltung ist aus Browse erreichbar.
10. Bei 2.000 Assets bleibt das Umschalten in die Listenansicht flüssig; Blob-Details werden nur für den sichtbaren Bereich geladen.
11. `/timeline` und `/timeline/:assetId` leiten dauerhaft auf die Browse-Routen um.

## Umsetzungsschritte

1. **Routing und Navigation.** `/browse` auf `Timeline`, Redirects, `TopNav` bereinigen. Danach ist `Home` unerreichbar, aber noch vorhanden.
2. **Defaults und Filtermenü.** Filter auf „alles anzeigen" umstellen, seltene Filter ins Menü verschieben.
3. **Listenansicht.** Umschalter, Karten-Zeilen mit Blob-Zusammenfassung, Virtualisierung und bereichsbezogenes Nachladen.
4. **Sortierung.** Sortierparameter in `queryCatalogTimeline`, Gruppierung ansichtsabhängig.
5. **Server-Kontext und Serververwaltung.** `serverId`-Filter, Selektor und `ServerListPopup`-Einstieg in der Bedienleiste.
6. **Auswahl und Löschen.** Asset-Mehrfachauswahl, Planvorschau, Übernahme der Löschlogik aus `Home`, Fortschrittsdialog.
7. **Aufräumen.** `Home` und die vier Blobliste-Modi entfernen, `RelationshipTree` und Graph-Utilities nach Prüfung entfernen, `Timeline.tsx` in Komponenten aufteilen.
8. **Folgeschritt.** Mirror und Sync ausführbar machen.

Die Schritte 1 bis 6 sind je für sich lauffähig und einzeln überprüfbar. Schritt 7 ist bewusst ans Ende gestellt, damit die alte Ansicht bis zur Abnahme der neuen als Vergleich verfügbar bleibt.

## Referenzen

- [Benutzerbezogener Blob-Katalog und Medien-Timeline](2026-08-02-user-blob-catalog-design.md)
- [Blob-Relationship-Tree](2026-06-18-blob-relationship-tree-design.md)
- Prototyp: `/Users/flox/.codex/worktrees/749e/bouquet`
