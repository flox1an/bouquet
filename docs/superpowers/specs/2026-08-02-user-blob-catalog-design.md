# Benutzerbezogener Blob-Katalog und Medien-Timeline

## Status

Konzeptentwurf für eine schrittweise Implementierung. Dieses Dokument erweitert den bestehenden Entwurf zur Relationship-Ansicht. Dessen Entscheidung, den Graphen zunächst ausschließlich im Speicher zu halten, bleibt für die bestehende Ansicht nachvollziehbar, reicht für einen vollständigen, inkrementell aufgebauten Benutzerkatalog jedoch nicht aus.

## Problem

Bouquet betrachtet Inhalte derzeit überwiegend aus Sicht einzelner Blossom- oder NIP-96-Server. Ein Server liefert eine Liste technischer Blob-Deskriptoren; anschließend versucht die Oberfläche, daraus Bilder, Videos, Audiodateien, Dokumente und Beziehungen abzuleiten.

Diese Sicht hat mehrere Grenzen:

- Ein Blob ist nur durch seinen SHA-256-Hash eindeutig bestimmt und enthält selbst keine verlässliche semantische Bedeutung.
- Derselbe Blob kann auf mehreren Servern liegen und dort zu unterschiedlichen Zeitpunkten beobachtet oder hochgeladen worden sein.
- Server ohne `/list/<pubkey>` können bekannte Hashes beantworten, aber ihren Bestand nicht vollständig aufzählen.
- Ein Benutzerkontext entsteht aus mehreren Quellen: Serverlisten, Blob-Listen, Nostr-Events, `x`-Tags, URLs, Uploads, Spiegelungen und referenzierten Manifesten.
- Metadaten können aus Serverantworten, Nostr-Events, Dateiinhalten oder abgeleiteten Beziehungen stammen und einander widersprechen.
- Ein logisches Medium kann aus vielen Blobs bestehen. Ein HLS-Video umfasst beispielsweise Master- und Varianten-Playlists, Init-Segmente, Mediensegmente, Vorschaubilder und Untertitel.
- Eine Timeline benötigt ein fachliches Medium mit Titel, Vorschau und sinnvollem Datum; eine flache Liste von Hashes ist dafür nicht ausreichend.

Bouquet benötigt daher einen persistenten, benutzerbezogenen Katalog, der bekannte Hashes entdeckt, Belege und Metadaten mit Provenienz speichert, Serververfügbarkeit beobachtet und daraus benutzerorientierte Medienobjekte ableitet.

## Zielbild

Bouquet baut für jeden verwendeten Nostr-Pubkey einen lokalen, rekonstruierbaren Katalog auf. Dieser Katalog beantwortet insbesondere:

1. Welche Blob-Hashes gehören zum Kontext dieses Benutzers?
2. Durch welche Quelle oder Beziehung gehört ein Hash zu diesem Kontext?
3. Auf welchen Servern wurde der Blob wann als verfügbar oder nicht verfügbar beobachtet?
4. Welche Nostr-Events beschreiben oder verwenden den Blob?
5. Welche intrinsischen und extern behaupteten Metadaten sind bekannt?
6. Gehört der Blob zu einem größeren logischen Medium?
7. Welches Datum, welcher Titel und welche Vorschau sollen in einer Timeline erscheinen?
8. Ist ein logisches Medium auf einem bestimmten Server vollständig verfügbar?

Die Standardansicht zeigt später logische Medienobjekte. Hashes, Repliken, Provenienz und Graphbeziehungen bleiben in technischen Detail- und Verwaltungsansichten erreichbar.

## Nicht-Ziele

Der erste Ausbau soll ausdrücklich nicht:

- alle Blobs eines Servers ohne Listenfunktion erraten oder enumerieren;
- das gesamte globale Nostr-Netz indexieren;
- eine serverseitige Suchmaschine voraussetzen;
- vollständige Mediendateien dauerhaft in der Katalogdatenbank speichern;
- widersprüchliche Metadaten durch verlustreiches Überschreiben vereinheitlichen;
- sofort alle bekannten Dateitypen und Manifestformate unterstützen;
- die bestehende technische Blob- und Relationship-Ansicht entfernen.

## Begriffe

### Benutzerkontext

Der **Benutzerkontext** ist die Menge aller Entitäten, die Bouquet einem aktiven Nostr-Pubkey zuordnet. Die Zuordnung muss immer durch mindestens einen gespeicherten Beleg erklärbar sein.

### Blob

Ein **Blob** ist unveränderlicher Binärinhalt, der durch seinen SHA-256-Hash adressiert wird. Intrinsische Fakten wie der Hash oder aus dem Inhalt berechnete Eigenschaften gehören zum Blob. Eine Server-URL oder ein Uploadzeitpunkt gehören nicht zum Blob selbst.

### Replik

Eine **Replik** ist die vermutete oder beobachtete Verfügbarkeit eines Blobs auf einem konkreten Server. Sie besitzt einen aktuellen Zustand und eine Historie relevanter Zustandsänderungen.

### Nostr-Referenz

Eine **Nostr-Referenz** verbindet ein gespeichertes Nostr-Event mit einem Blob, einer URL oder einem logischen Medium. Sie enthält die Rolle der Referenz und ihre Provenienz, beispielsweise `x`, `url`, `thumb`, `image`, `fallback`, `mirror`, `imeta` oder `text-track`.

### Blob-Beziehung

Eine **Blob-Beziehung** verbindet zwei technische Inhalte. Beispiele sind `playlist-references-playlist`, `playlist-references-segment`, `thumbnail-of`, `transcoded-from` und `subtitle-for`.

### Asset

Ein **Asset** ist das benutzerorientierte, logische Medium, das in der Timeline erscheint: ein Foto, ein Audiotrack, ein Video oder ein Dokument. Ein Asset kann keinen, einen oder mehrere erklärende Nostr-Events und einen oder mehrere Blobs besitzen.

### Rendition

Eine **Rendition** ist eine konkrete Darstellung eines Assets, beispielsweise das Originalbild, ein Thumbnail, eine 720p-Videovariante oder eine HLS-Masterplaylist.

### Fakt

Ein **Fakt** ist eine einzelne Metadatenbehauptung mit Quelle, Beobachtungszeit und optionaler Vertrauensbewertung. Der Katalog kann mehrere widersprüchliche Fakten für dasselbe Feld behalten.

### Projection

Eine **Projection** ist eine für einen Anwendungsfall berechnete, denormalisierte Sicht. Die Timeline-Projection wählt zum Beispiel aus allen Fakten einen Anzeigetitel, ein Anzeigedatum und eine Vorschau, ohne die zugrunde liegenden Fakten zu verändern.

## Invarianten

1. Der SHA-256-Hash ist die kanonische Identität eines Blobs.
2. Jeder Blob im Benutzerkontext besitzt mindestens einen nachvollziehbaren Mitgliedschaftsbeleg.
3. Das Fehlen eines Blobs auf einem Server ist eine zeitgebundene Beobachtung und keine permanente Wahrheit.
4. Netzwerkfehler, fehlende Berechtigung und `404 Not Found` sind unterschiedliche Zustände.
5. `uploadedAt`, `eventCreatedAt`, `capturedAt`, `firstSeenAt` und `observedAt` werden nicht vermischt.
6. Metadatenwerte werden nicht ohne Provenienz gespeichert.
7. Teure, inhaltsbasierte Extraktion wird anhand von Blob-Hash und Extraktorversion gecacht.
8. Reverse Lookups nach bekannten Hashes erweitern den Benutzerkontext nicht unbegrenzt.
9. Ein Asset ist nicht mit einem Blob identisch.
10. Destruktive Aktionen arbeiten nur mit vollständig erklärten technischen Ziel-Blobs.

## Grenzen der Discovery

Ein Server ohne `/list/<pubkey>` kann nur auf bekannte Blob-Hashes geprüft werden. Weder `HEAD /<hash>` noch `GET /<hash>` ermöglichen die Entdeckung unbekannter Hashes. Daraus folgt:

- Die Gesamtsumme ist immer die Summe der **dem Katalog bekannten** Hashes, nicht garantiert die Summe aller jemals vom Benutzer hochgeladenen Inhalte.
- Jeder Zähler muss seinen Discovery-Stand sichtbar machen, etwa „12.430 bekannte Hashes; 5 von 7 Serverlisten vollständig synchronisiert“.
- Server ohne Listenfunktion tragen zur Verfügbarkeitsprüfung bekannter Hashes bei, aber nicht zur initialen Enumeration.
- Neue Seeds aus Nostr-Events, Uploadbelegen, Imports oder Manifesten können die Menge später erweitern.

Der Katalog arbeitet deshalb als monoton wachsender Discovery-Index mit explizitem Bereinigungs- und Vergessensprozess, nicht als einmalige vollständige Inventur.

## Quellen des Benutzerkontexts

### Direkte Seeds

Direkte Seeds dürfen einen Hash unmittelbar in den Benutzerkontext aufnehmen:

1. Blob-Deskriptoren aus `/list/<pubkey>` auf konfigurierten Blossom-Servern.
2. Dateien aus einer authentifizierten NIP-96-Liste des Benutzers.
3. Erfolgreiche Upload-, Medienoptimierungs- oder Mirror-Antworten innerhalb von Bouquet.
4. Relevante Nostr-Events, die vom aktiven Pubkey signiert wurden.
5. Manuell importierte Blossom-URLs oder Hashes.
6. Bereits lokal bekannte Uploadhistorie, sofern ihre Zuordnung zum Pubkey belegt ist.

### Abgeleitete Seeds

Aus direkten Seeds dürfen kontrolliert weitere Hashes abgeleitet werden:

- Hashes in Blossom-URLs;
- `x` und `ox` in NIP-94-Metadaten;
- Felder in `imeta`, insbesondere `x`, `url`, `image`, `fallback` und `mirror`;
- `thumb`, `image`, `url` und `text-track`;
- Hashes in Event-Inhalten;
- Kind-spezifische Tags für Bilder, Videos, Audio, Playlists und Alben;
- Master- und Varianten-Playlists;
- Init- und Mediensegmente;
- explizite Ableitungsbeziehungen wie Original und serverseitig optimierte Datei.

### Reverse Lookup

Für jeden bekannten Hash kann Bouquet Nostr-Relays nach Events mit `#x` fragen. Diese Events liefern zusätzliche Beschreibung und Verwendungskontexte.

Ein Reverse-Lookup-Event wird vollständig gecacht, erweitert den Benutzerkontext aber nicht automatisch um sämtliche beliebigen Referenzen des Events. Standardmäßig dürfen nur klar medienbezogene Begleiter desselben Treffers aufgenommen werden, beispielsweise Thumbnail, Fallback, Untertitel oder Varianten. Andere Referenzen bleiben externe Hinweise, bis eine zusätzliche Mitgliedschaftsregel greift.

Diese Regel verhindert, dass ein einzelner bekannter Hash über soziale Posts und verlinkte Inhalte einen unbeschränkten Crawl auslöst.

## Discovery als Fixpunktberechnung

Die bekannte Hashmenge wird nicht in einem einzigen Request bestimmt. Sie entsteht iterativ:

1. Direkte Seeds laden.
2. URLs normalisieren und darin enthaltene Blossom-Hashes extrahieren.
3. Referenzen aus Benutzer-Events extrahieren.
4. Neue Hashes und Mitgliedschaftsbelege persistieren.
5. Für neue Hashes Reverse Lookups durchführen.
6. Kleine Manifestkandidaten laden und parsen.
7. Manifest-Nachkommen als abgeleitete Seeds persistieren.
8. Wiederholen, bis keine zulässigen neuen Seeds entstehen oder konfigurierte Grenzen erreicht sind.

Jeder Expansionsschritt benötigt:

- eine Beziehungsart;
- einen Quellbeleg;
- eine maximale Tiefe;
- eine maximale Zahl neuer Nachkommen;
- Zykluserkennung;
- einen Zustand wie `pending`, `complete`, `failed` oder `truncated`.

## Nostr-Event-Discovery und Cache

### Ereignisumfang

Der erste Umfang übernimmt mindestens die heute bereits verwendeten Arten:

- `1`: Social Post;
- `20`: Picture;
- `21`, `22`: unveränderliche Video-Events;
- `1063`: NIP-94 File Metadata;
- `30563`: Blossom Drive;
- `31337`: Audio gemäß aktueller Bouquet-Unterstützung;
- `34235`, `34236`: adressierbare Video-Events.

Weitere Kind-spezifische Extraktoren können später hinzukommen. Der rohe Event-Cache darf unbekannte Kinds trotzdem speichern, wenn sie als Ergebnis einer zulässigen Abfrage empfangen wurden.

### Abfragestrategie

1. Benutzer-Relays bestimmen und den verwendeten Relaysatz versioniert speichern.
2. Relevante Events des aktiven Autors vollständig paginiert abrufen; ein festes `limit: 100` genügt nicht für eine Inventur.
3. Events nach Event-ID deduplizieren und ihre Relay-Sichtungen getrennt speichern.
4. Replaceable- und Addressable-Event-Semantik berücksichtigen, ohne ältere Versionen sofort zu löschen.
5. Referenzen deterministisch aus dem gespeicherten Roh-Event extrahieren.
6. Bekannte Hashes in begrenzten Batches per `#x` rückwärts suchen.
7. Pro Relay und Filterfamilie einen Cursor beziehungsweise Fortschritt speichern, damit die Synchronisation fortgesetzt werden kann.

### Cache-Anforderungen

Bouquet verwendet bereits einen Nostr-Event-Cache für die Netzwerkebene. Der Benutzerkatalog benötigt zusätzlich eine stabile Domänensicht auf alle für ihn relevanten Events. Dafür speichert der Katalog:

- das vollständige signierte Event;
- Event-ID, Pubkey, Kind und `created_at` als indexierbare Felder;
- erste und letzte Sichtung;
- die Relays, von denen es empfangen wurde;
- den Extraktorstatus und die Extraktorversion;
- alle abgeleiteten Blob- und URL-Referenzen.

Diese bewusste Speicherung der relevanten Teilmenge macht die Timeline offline rekonstruierbar und entkoppelt das Domänenmodell von der internen Struktur des allgemeinen Nostr-Caches.

## Vorgeschlagenes persistentes Datenmodell

Die Tabellenbezeichnungen sind konzeptionell. Sie legen das Domänenmodell und notwendige Indizes fest, aber noch keine konkrete IndexedDB-Bibliothek oder SQL-Syntax.

### `profile`

Ein Katalogbereich pro Nostr-Identität.

| Feld | Bedeutung |
| --- | --- |
| `pubkey` | Hex-Pubkey, Primärschlüssel |
| `created_at` | Katalog erstmals angelegt |
| `last_sync_at` | Letzte erfolgreich abgeschlossene Gesamtsynchronisation |
| `catalog_version` | Version der Katalogregeln |

### `server`

Normalisierte Speicher- oder Medienserver.

| Feld | Bedeutung |
| --- | --- |
| `server_id` | Stabile interne ID |
| `base_url` | Kanonische Basis-URL |
| `server_type` | Blossom oder NIP-96 |
| `capabilities` | Beobachtete Funktionen wie list, mirror, media, range |
| `last_capability_check_at` | Letzte Prüfung |

Eindeutiger Index: normalisierte `base_url`.

### `profile_server`

Verknüpft einen Pubkey mit dessen konfigurierten oder entdeckten Servern.

| Feld | Bedeutung |
| --- | --- |
| `pubkey` | Benutzerkontext |
| `server_id` | Server |
| `source` | Benutzerkonfiguration, Kind-10063-Event oder manuell |
| `enabled` | Für Discovery und Prüfung aktiv |
| `first_seen_at` | Erste Zuordnung |
| `last_seen_at` | Letzte Bestätigung |

### `blob`

Globale, profilunabhängige Blob-Identität.

| Feld | Bedeutung |
| --- | --- |
| `sha256` | Primärschlüssel |
| `verified_size` | Inhalts- oder konsensbasiert bestimmte Größe |
| `verified_mime_type` | Bevorzugter erkannter MIME-Type |
| `first_seen_at` | Erstmals in Bouquet entdeckt |
| `last_enriched_at` | Letzte Metadatenanreicherung |

Der Blob enthält bewusst kein einzelnes globales `uploaded_at` und keine einzelne Server-URL.

### `profile_blob_membership`

Materialisierte Mitgliedschaft eines Blobs in einem Benutzerkontext.

| Feld | Bedeutung |
| --- | --- |
| `pubkey` | Benutzerkontext |
| `sha256` | Blob |
| `first_seen_at` | Erste Zuordnung |
| `last_seen_at` | Letzte Bestätigung durch irgendeinen Beleg |
| `status` | active, unresolved, forgotten |

Eindeutiger Index: `(pubkey, sha256)`.

### `profile_blob_evidence`

Erklärt jede Mitgliedschaft. Mehrere Belege pro Blob sind zulässig und erwünscht.

| Feld | Bedeutung |
| --- | --- |
| `evidence_id` | Primärschlüssel |
| `pubkey` | Benutzerkontext |
| `sha256` | Blob |
| `evidence_type` | server-list, authored-event, upload, mirror, manual, manifest-child, reverse-event |
| `source_id` | Serverlauf, Event-ID, Upload-ID oder Elternbeziehung |
| `relation_role` | main, thumbnail, fallback, variant, segment, subtitle usw. |
| `discovered_at` | Zeitpunkt der Entdeckung |
| `depth` | Distanz zu einem direkten Seed |

Index: `(pubkey, sha256)` sowie `(evidence_type, source_id)`.

### `blob_url`

Alle bekannten URLs und deren Zuordnung zu einem Hash.

| Feld | Bedeutung |
| --- | --- |
| `blob_url_id` | Primärschlüssel |
| `sha256` | Optional, solange die URL nicht aufgelöst ist |
| `url` | Vollständige normalisierte URL |
| `url_role` | primary, server-location, mirror, fallback, thumbnail, external |
| `source_type` | Serverantwort, Event, Manifest oder manuell |
| `source_id` | Provenienz |
| `first_seen_at` | Erste Sichtung |
| `last_seen_at` | Letzte Sichtung |

Eine URL ohne bekannten Hash bleibt als ungelöste Referenz erhalten. Bouquet darf den Hash nur aus einem vertrauenswürdigen Tag, einer Blossom-URL oder durch tatsächliches Hashen des Inhalts bestimmen.

### `blob_location`

Aktueller zusammengefasster Zustand eines Blobs auf einem Server.

| Feld | Bedeutung |
| --- | --- |
| `sha256` | Blob |
| `server_id` | Server |
| `state` | present, absent, unauthorized, rate_limited, unreachable, unknown |
| `first_present_at` | Erste positive Beobachtung |
| `last_present_at` | Letzte positive Beobachtung |
| `last_checked_at` | Letzter Prüfversuch |
| `next_check_at` | Frühester nächster Prüfzeitpunkt |
| `reported_size` | Letzte Serverangabe |
| `reported_mime_type` | Letzte Serverangabe |
| `reported_uploaded_at` | Vom Listen-Endpunkt gemeldeter Uploadzeitpunkt |
| `sunset_at` | Optionaler Sunset-Header |
| `canonical_url` | Bevorzugte Abruf-URL auf diesem Server |
| `consecutive_failures` | Backoff-Steuerung |

Eindeutiger Index: `(sha256, server_id)`. Zusätzliche Indizes: `(server_id, state)` und `next_check_at`.

### `blob_location_history`

Historisiert relevante Zustandsänderungen, nicht jeden identischen Poll.

| Feld | Bedeutung |
| --- | --- |
| `observation_id` | Primärschlüssel |
| `sha256` | Blob |
| `server_id` | Server |
| `observed_at` | Prüfzeitpunkt |
| `previous_state` | Vorheriger Zustand |
| `new_state` | Neuer Zustand |
| `http_status` | Optionaler HTTP-Status |
| `reason` | Diagnose, nicht für Control Flow |
| `reported_size` | Beobachteter Wert |
| `reported_mime_type` | Beobachteter Wert |
| `sunset_at` | Beobachteter Wert |

Eine erneute identische positive Prüfung aktualisiert normalerweise nur `last_present_at` und `last_checked_at`. Eine neue Historienzeile entsteht bei Zustandswechseln oder relevanten Headeränderungen. Dadurch bleibt die Historie aussagekräftig und wächst nicht mit jedem Poll unbeschränkt.

### `nostr_event`

Persistierte relevante Events.

| Feld | Bedeutung |
| --- | --- |
| `event_id` | Primärschlüssel |
| `pubkey` | Autor |
| `kind` | Event-Kind |
| `created_at` | Nostr-Zeitstempel |
| `raw_event` | Vollständiges signiertes Event |
| `first_seen_at` | Erste Sichtung |
| `last_seen_at` | Letzte Sichtung |
| `address` | Optionaler Schlüssel für Addressable Events |
| `superseded_by` | Optionaler Verweis auf neuere Version |
| `extraction_version` | Version der Referenzextraktion |
| `extraction_state` | pending, complete, failed |

Indizes: `(pubkey, kind, created_at)`, `address` und `extraction_state`.

### `nostr_event_relay`

| Feld | Bedeutung |
| --- | --- |
| `event_id` | Event |
| `relay_url` | Relay |
| `first_seen_at` | Erste Sichtung auf diesem Relay |
| `last_seen_at` | Letzte Sichtung |

### `event_blob_reference`

Normalisierte Referenzen eines Events.

| Feld | Bedeutung |
| --- | --- |
| `reference_id` | Primärschlüssel |
| `event_id` | Quell-Event |
| `sha256` | Optionaler aufgelöster Blob |
| `url` | Optional referenzierte URL |
| `tag_name` | x, ox, url, image, thumb, imeta, text-track usw. |
| `role` | main, original, thumbnail, preview, mirror, fallback, subtitle, variant |
| `tag_index` | Position im Originalevent |
| `claimed_mime_type` | Eventbehauptung |
| `claimed_dimensions` | Eventbehauptung |

### `blob_relationship`

Dauerhafte Kanten des Inhaltsgraphen.

| Feld | Bedeutung |
| --- | --- |
| `relationship_id` | Primärschlüssel |
| `from_sha256` | Eltern- oder Quellblob |
| `to_sha256` | Zielblob, falls aufgelöst |
| `to_url` | Ziel-URL, falls Hash unbekannt |
| `relationship_type` | playlist, segment, init-segment, thumbnail, subtitle, derived-from usw. |
| `source_type` | event, playlist-body, extractor oder user |
| `source_id` | Event-ID, Blob-Hash oder Extraktorlauf |
| `first_seen_at` | Erste Ableitung |
| `last_verified_at` | Letzte erfolgreiche Bestätigung |
| `state` | active, unresolved, failed, truncated |

### `metadata_fact`

Quellenbewusster Metadatenspeicher.

| Feld | Bedeutung |
| --- | --- |
| `fact_id` | Primärschlüssel |
| `subject_type` | blob, asset, event oder relationship |
| `subject_id` | Identität des Subjekts |
| `namespace` | common, image, audio, video, document, playlist usw. |
| `field` | title, artist, width, duration, codec, captured_at usw. |
| `value` | Typisierter oder serialisierter Wert |
| `value_type` | string, number, timestamp, dimensions, json |
| `source_type` | content, event, server, user, heuristic |
| `source_id` | Extraktorlauf, Event-ID oder Serverbeobachtung |
| `confidence` | Optional für heuristische Quellen |
| `observed_at` | Erfassungszeitpunkt |
| `extractor_version` | Für reproduzierbare Neuberechnung |

Der flexible Faktenspeicher verhindert eine eigene Tabelle für jedes seltene Format. Häufig benötigte gemeinsame Felder werden zusätzlich in Projections materialisiert und indexiert.

### `extractor_result`

| Feld | Bedeutung |
| --- | --- |
| `sha256` | Blob |
| `extractor_name` | image-header, exif, id3, video-metadata, hls usw. |
| `extractor_version` | Implementationsversion |
| `state` | pending, complete, failed, unsupported |
| `payload` | Formatnahes Ergebnis für spätere Reprojektion |
| `completed_at` | Abschlusszeitpunkt |
| `error_class` | Klassifizierter Fehler |
| `retry_after` | Optionaler neuer Versuch |

Eindeutiger Index: `(sha256, extractor_name, extractor_version)`.

### `asset`

Stabile Identität eines logischen Mediums innerhalb eines Benutzerkontexts.

| Feld | Bedeutung |
| --- | --- |
| `asset_id` | Interne stabile ID |
| `pubkey` | Benutzerkontext |
| `identity_type` | addressable-event, immutable-event, root-blob, manual |
| `identity_value` | Event-Address, Event-ID oder Root-Hash |
| `asset_type` | image, video, audio, document, collection, unknown |
| `state` | active, incomplete, ambiguous, hidden |
| `first_seen_at` | Erste Ableitung |
| `last_projected_at` | Letzte Neuberechnung |

Ein Event kann ein Asset stabil identifizieren. Fehlt ein erklärendes Event, wird zunächst ein Root-Blob als synthetische Identität verwendet. Späteres Event-Matching darf Assets zusammenführen, muss aber die alte Identität als Alias erhalten, damit UI-Zustand und Links stabil bleiben.

### `asset_blob`

| Feld | Bedeutung |
| --- | --- |
| `asset_id` | Asset |
| `sha256` | Blob |
| `role` | primary, original, thumbnail, preview, rendition, playlist, segment, subtitle |
| `ordinal` | Reihenfolge innerhalb des Assets |
| `relationship_source_id` | Erklärender Beleg |

### `timeline_projection`

Denormalisierte, jederzeit rekonstruierbare Lesesicht.

| Feld | Bedeutung |
| --- | --- |
| `asset_id` | Asset |
| `pubkey` | Benutzerkontext |
| `display_type` | Bild, Video, Audio, Dokument usw. |
| `display_title` | Bevorzugter Titel |
| `display_subtitle` | Künstler, Beschreibung oder Typinformation |
| `display_date` | Für Gruppierung und Sortierung |
| `display_date_source` | captured, event, uploaded oder first-seen |
| `preview_blob_sha256` | Bevorzugte Vorschau |
| `primary_blob_sha256` | Primärer Inhalt |
| `duration` | Optional |
| `width`, `height` | Optional |
| `replica_count` | Zahl aktuell positiver Server |
| `availability_state` | complete, partial, unavailable, unknown |
| `metadata_completeness` | Technischer Enrichment-Stand |
| `updated_at` | Projektionszeitpunkt |

Indizes: `(pubkey, display_date)`, `(pubkey, display_type, display_date)` und `(pubkey, availability_state)`.

### `sync_cursor` und `job`

Fortsetzbare Discovery und Enrichment benötigen persistente Arbeitsstände.

`sync_cursor` speichert pro Pubkey und Quelle unter anderem:

- Serverlisten-Cursor;
- Relay und Filterfamilie;
- ältesten vollständig synchronisierten Event-Zeitpunkt;
- letzten erfolgreichen Abschluss;
- Fehler und Backoff.

`job` speichert begrenzte, deduplizierte Arbeit wie:

- Hash auf Server prüfen;
- Reverse Lookup durchführen;
- Event extrahieren;
- Playlist parsen;
- Metadaten extrahieren;
- Asset oder Timeline neu projizieren.

## Aktueller Zustand und Historisierung

Nicht jede Beobachtung verdient eine unbegrenzt wachsende Historienzeile. Das Modell trennt deshalb:

- `blob_location`: aktueller Zustand plus erste und letzte positive Sichtung;
- `blob_location_history`: Zustandswechsel und relevante Metadatenänderungen;
- Job- und Request-Diagnostik: kurzfristig und bereinigbar.

Beispiele:

- `unknown → present`: Historienzeile anlegen.
- `present → present`: nur `last_present_at` und `last_checked_at` aktualisieren.
- `present → absent`: Historienzeile anlegen, aber später erneut prüfen.
- `present → unreachable`: Historienzeile anlegen; nicht als Löschung interpretieren.
- MIME-Type oder Sunset ändert sich: Historienzeile anlegen.

Die Aufbewahrungsdauer technischer Fehlerprotokolle kann begrenzt werden. Zustandswechsel sollten dauerhaft oder zumindest über einen langen, konfigurierbaren Zeitraum erhalten bleiben.

## Metadatenmodell

### Quellenklassen

1. **Intrinsisch verifiziert:** Hash, tatsächlich gelesene Größe, durch Content-Sniffing erkannter Typ.
2. **Inhaltlich extrahiert:** EXIF, ID3, Bilddimensionen, Dauer, Codecs, PDF-Metadaten.
3. **Vom Benutzer publiziert:** Metadaten in eigenen signierten Nostr-Events.
4. **Extern publiziert:** Metadaten in Events anderer Autoren.
5. **Vom Server berichtet:** Blob Descriptor, HTTP-Header, BUD-08-Felder.
6. **Heuristisch:** Dateiendung, URL-Muster oder abgeleitete Klassifikation.

### Auswahl für die Projection

Eine erste Standardpriorität:

1. explizite Benutzerkorrektur;
2. eigene signierte Nostr-Metadaten;
3. intrinsisch oder inhaltlich verifizierte Werte;
4. Event-Metadaten vertrauenswürdiger anderer Autoren;
5. konsistente Serverangaben;
6. Heuristik.

Die Priorität kann feldabhängig sein. Für Dimensionen ist Content-Extraktion stärker als ein Event-Tag; für einen redaktionellen Titel kann das eigene Event stärker als ein eingebetteter Dateiname sein. Die Projection-Regeln müssen daher pro Feld dokumentiert und versioniert werden.

### MIME-spezifische Extraktoren

#### Allgemein

- tatsächliche Größe;
- MIME-Sniffing;
- Dateiname, sofern vertrauenswürdig überliefert;
- mögliche Erweiterung;
- Prüfsumme bereits durch Blob-Identität gegeben.

#### Bilder

- Breite und Höhe;
- Orientierung;
- EXIF-Aufnahmezeit;
- Kameradaten optional;
- Blurhash oder dominante Farbe;
- lokales kleines Thumbnail, falls kein externes Preview vorhanden ist.

#### Audio

- Dauer;
- Titel, Künstler, Album und Jahr;
- Track- und Discnummer;
- Codec und Bitrate;
- eingebettetes Cover als abgeleitete Vorschau.

#### Video

- Dauer;
- Breite, Höhe und Orientierung;
- Container und Codecs;
- Framerate optional;
- eingebettetes oder abgeleitetes Poster;
- HLS-Erkennung.

#### Dokumente

- Seitenzahl;
- Titel und Autor, falls eingebettet;
- erste Seite als Preview;
- Volltextindizierung ist nicht Teil der ersten Ausbaustufe.

#### HLS und andere Manifeste

- Manifesttyp;
- Varianten, Bandbreite, Auflösung und Codecs;
- Init- und Mediensegmente;
- Gesamtdauer, soweit ableitbar;
- Vollständigkeit pro Server;
- Parsezustand und Begrenzungsgrund.

### Kostensteuerung

Enrichment erfolgt nicht global und gleichzeitig. Priorität haben:

1. aktuell sichtbare Timeline-Assets;
2. neue direkte Seeds;
3. Assets ohne Vorschau oder Typ;
4. technische Nachkommen wie Segmente zuletzt.

Vor einem vollständigen Download werden nach Möglichkeit Nostr-Tags, Server-Header, kleine Range-Requests oder Browser-Medienmetadaten verwendet. Ein fehlender Range-Support darf zu einem bewussten, sichtbaren Zustand `needs-full-download` führen, statt automatisch große Dateien herunterzuladen.

## Verfügbarkeitsprüfung

### Planung

Für jeden neuen bekannten Hash werden zunächst die Server geprüft, die ihn direkt gemeldet haben. Weitere aktive Server des Benutzerkontexts werden anschließend mit begrenzter Parallelität geprüft.

Prioritäten:

1. Server, der den Seed geliefert hat;
2. Server, die von einer URL oder einem Event genannt wurden;
3. übrige vom Benutzer konfigurierte Server;
4. deaktivierte oder historische Server nur auf ausdrückliche Anforderung.

### TTL und Backoff

- `present`: lange TTL, sofern kein nahes Sunset bekannt ist;
- `absent`: mittlere TTL, weil der Blob später gespiegelt werden kann;
- `unreachable` und `rate_limited`: exponentieller Backoff;
- `unauthorized`: erneute Prüfung nach Authentifizierungsänderung;
- sichtbare oder aktionsrelevante Assets dürfen früher aktualisiert werden.

### Vollständigkeit zusammengesetzter Assets

Die Verfügbarkeit eines HLS-Videos oder eines anderen zusammengesetzten Assets wird über die notwendige Closure seiner Blob-Beziehungen berechnet:

- `complete`: alle notwendigen Blobs auf demselben Server vorhanden;
- `partial`: mindestens ein notwendiger Blob fehlt oder ist unbekannt;
- `unavailable`: kein primärer Root abrufbar;
- `unknown`: Graph oder Prüfungen unvollständig;
- `truncated`: Expansionsgrenzen verhindern eine sichere Aussage.

Ein Asset kann global vollständig sein, obwohl kein einzelner Server alle Teile hält. Für tatsächliche Wiedergabe und sichere Spiegelaktionen muss zusätzlich die Vollständigkeit pro Server berechnet werden.

## Zeitmodell und Timeline-Datum

Folgende Zeitpunkte bleiben getrennt:

| Zeitpunkt | Bedeutung |
| --- | --- |
| `captured_at` | Aufnahme- oder Erstellzeit aus Inhalt oder expliziter Metadatenquelle |
| `event_created_at` | Publikationszeit eines beschreibenden Nostr-Events |
| `reported_uploaded_at` | Vom konkreten Server gemeldete Uploadzeit |
| `first_seen_at` | Erste Entdeckung durch Bouquet |
| `observed_at` | Zeitpunkt einer einzelnen Beobachtung |
| `last_checked_at` | Letzte Verfügbarkeitsprüfung |

Standardregel für `display_date`:

1. vertrauenswürdiges `captured_at`;
2. `created_at` des bevorzugten beschreibenden Events;
3. frühestes plausibles `reported_uploaded_at` einer Replik;
4. `first_seen_at`.

Die Projection speichert zusätzlich `display_date_source`, damit die UI die Herkunft erklären und spätere Regeländerungen neu projizieren kann.

Eine bei `HEAD` eingesetzte aktuelle Uhrzeit ist `observed_at`, niemals `uploaded_at`.

## Asset-Bildung

### Identitätsregeln

1. Ein Addressable Event identifiziert ein stabiles Asset über seine Nostr-Adresse.
2. Ein immutable Event identifiziert ein Asset über seine Event-ID.
3. Ein alleinstehender Blob erzeugt zunächst ein synthetisches Root-Asset.
4. Eine erkannte Masterplaylist kann Root eines Video-Assets sein.
5. Thumbnail, Untertitel, Segmente und alternative Renditions werden Rollen eines Assets, nicht eigene Timeline-Einträge.
6. Derselbe Blob darf mehreren Assets zugeordnet sein, wenn mehrere legitime Verwendungskontexte existieren.
7. Unsichere Zusammenführungen bleiben getrennt und werden als `ambiguous` markiert.

### Ereignis- und Blob-Konflikte

Mehrere Events können denselben Blob unterschiedlich beschreiben. Bouquet muss unterscheiden:

- mehrere Beschreibungen desselben Assets;
- Wiederverwendung desselben Blobs in unterschiedlichen Assets;
- neuere Version eines Addressable Events;
- Varianten oder Derivate;
- zufällige oder missbräuchliche Fremdreferenz.

Automatische Zusammenführung ist nur zulässig, wenn eine stabile Event-Adresse, eine explizite Relation oder eine eindeutige Manifeststruktur sie begründet. Gleicher Hash allein bedeutet gleicher Binärinhalt, nicht zwingend gleicher Verwendungskontext.

## Timeline-Projection und Oberfläche

### Hauptansicht

Die Standardansicht ist eine nach Datum gruppierte Medien-Timeline:

- Gruppierung nach Jahr, Monat und optional Tag;
- responsive Bild- oder Kartenansicht;
- genau ein Eintrag pro Asset;
- Preview statt Hash als primäres visuelles Element;
- Titel, Künstler, Dauer oder Dokumenttyp je nach Asset-Art;
- technische Warnungen nur bei tatsächlichen Problemen;
- progressive Anreicherung ohne Umsortierung durch bloße `observed_at`-Änderungen.

### Timeline-Zustände

- **Bereit:** Preview und ausreichende Metadaten vorhanden.
- **Wird angereichert:** Asset ist bereits sichtbar; Details folgen.
- **Unsortiert:** Blob gehört zum Benutzerkontext, kann aber noch keinem aussagekräftigen Asset zugeordnet werden.
- **Unvollständig:** Beziehungen oder Repliken fehlen.
- **Nicht verfügbar:** bekannte Metadaten bleiben sichtbar, obwohl keine positive Replik bekannt ist.
- **Mehrdeutig:** mehrere plausible Asset-Zuordnungen benötigen Auflösung.

### Detailansicht

Eine Asset-Detailansicht zeigt:

- große Preview oder Player;
- bevorzugte Metadaten;
- alternative Metadaten und Provenienz;
- Nostr-Events;
- Renditions und technische Bestandteile;
- aktuelle Serververfügbarkeit und relevante Historie;
- sichere Aktionen wie Kopieren, Spiegeln, Synchronisieren und Löschen.

### Technische Ansichten

Die bestehende Blobliste, Serveransicht und Relationship-Ansicht bleiben erhalten. Sie werden zu Diagnose- und Verwaltungsansichten, statt die primäre Navigation zu bestimmen.

## Architektur und Modul-Seams

Die UI soll weder Relay-Abfragen noch Server-Polling, Manifestparser oder Metadatenprioritäten kennen. Ein tiefes Katalog-Modul kapselt diese Implementierung hinter einer kleinen Interface:

```text
Catalog
  syncProfile(pubkey, options)
  getCatalogStatus(pubkey)
  queryTimeline(pubkey, query)
  getAsset(pubkey, assetId)
  refreshAsset(pubkey, assetId)
  planAction(pubkey, assetId, action)
```

Die genaue Form kann sich bei der Implementierung ändern. Die entscheidende Seam liegt zwischen:

- **Katalog-Implementierung:** Discovery, Persistenz, Jobs, Provenienz, Graph und Projection;
- **UI:** Timeline-Abfragen, Detailansicht, Fortschritt und Benutzeraktionen.

Interne Adapter sind erst dort sinnvoll, wo tatsächlich mehrere Implementierungen bestehen:

- Nostr-Quelle;
- Blossom-/NIP-96-Serverquelle;
- persistenter Store;
- MIME-spezifische Extraktoren.

## Lokale Datenbank oder Backend

Für die bestehende clientseitige Bouquet-Anwendung ist eine lokale IndexedDB-Datenbank der empfohlene erste Adapter:

- keine zusätzliche Infrastruktur;
- lokale und profilbezogene Daten;
- Offline-Timeline;
- inkrementelle Synchronisation über Sitzungen hinweg;
- bereits vorhandene Browserpersistenz im Projekt.

Der Store muss hinter einer Katalog-Seam liegen. Dann kann später ein serverseitiger Adapter hinzukommen, wenn geräteübergreifende Synchronisierung, zentrale Indexierung oder sehr große Kataloge erforderlich werden.

Die Katalogdatenbank ist ein rekonstruierbarer Index. Kanonische Quellen bleiben signierte Nostr-Events, gehashte Inhalte und aktuelle Serverbeobachtungen. Der Katalog darf daher gelöscht und aus seinen Quellen neu aufgebaut werden können.

### Speichergrenzen

- Vollständige Mediendateien gehören nicht in IndexedDB.
- Kleine abgeleitete Previews können getrennt in Cache Storage oder einem begrenzten Preview-Cache liegen.
- Roh-Events und Metadaten sind klein und dauerhaft speicherbar.
- Historie, Jobs und Fehlerdiagnostik benötigen Bereinigungsregeln.
- Speicherverbrauch und Quota-Fehler müssen im Katalogstatus sichtbar sein.

## Synchronisationszustand

Der Benutzer muss erkennen können, wie vollständig der Katalog ist. `getCatalogStatus` sollte mindestens liefern:

- Zahl bekannter Hashes;
- direkte und abgeleitete Seeds;
- pro Server: Listenstatus, Cursor und Fehler;
- pro Relay: Event-Synchronisationsstatus und Cursor;
- offene Reverse Lookups;
- offene Verfügbarkeitsprüfungen;
- offene und fehlgeschlagene Extraktionen;
- Zahl vollständiger, unvollständiger und unsortierter Assets;
- letzte vollständig abgeschlossene Synchronisation;
- angewendete Limits und Truncations.

„Synchronisiert“ bedeutet nur, dass alle aktuell konfigurierten Quellen bis zu ihren gespeicherten Cursors verarbeitet wurden. Es bedeutet nicht, dass keine unbekannten Blobs außerhalb dieser Quellen existieren.

## Datenschutz und Profiltrennung

- Alle Mitgliedschaften, Assets, Jobs und Synchronisationscursor werden nach Pubkey getrennt.
- Globale Blob-Fakten und Extraktorergebnisse dürfen profilübergreifend wiederverwendet werden, weil der Inhalt durch denselben Hash identifiziert ist.
- Ein Profil darf nicht allein durch globale Blobexistenz erfahren, dass ein anderer lokaler Benutzer denselben Blob verwendet; UI-Abfragen müssen immer über `profile_blob_membership` laufen.
- Private Schlüssel und Signer-Geheimnisse werden nicht im Katalog gespeichert.
- Beim Entfernen eines Profils werden seine Mitgliedschaften, Assets und Jobs gelöscht; globale Blob-Fakten dürfen nur bleiben, wenn ein anderer lokaler Kontext sie noch verwendet oder eine explizite Cache-Regel dies erlaubt.

## Fehler- und Sonderfälle

### Serverliste bricht während Pagination ab

Bereits empfangene Seiten werden mit dem Lauf verknüpft. Die Liste gilt nicht als vollständig; Cursor und Fehler bleiben erhalten. Nicht erneut gelistete Blobs werden nicht vorschnell als gelöscht markiert.

### Server meldet widersprüchliche Größe oder MIME-Type

Beide Serverbehauptungen werden als Provenienz erhalten. Inhaltsbasierte Verifikation kann einen bevorzugten Wert setzen. Ein Größenwiderspruch bei gleichem Hash ist ein Integritätswarnsignal.

### URL enthält keinen Hash

Die URL bleibt ungelöst. Bouquet kann sie über Event-Metadaten, Redirect-Ziele oder tatsächliches Herunterladen und Hashen auflösen. Ein `Content-Length`- oder MIME-Header allein identifiziert keinen Blob.

### Event verschwindet von einem Relay

Das zuvor signierte Event bleibt im lokalen Katalog. Die Relay-Sichtung wird aktualisiert; das Event wird nicht ohne explizite Lösch- oder Bereinigungsregel entfernt.

### Addressable Event wird ersetzt

Die neue Version wird bevorzugt, ältere Events und daraus gewonnene Provenienz bleiben historisch nachvollziehbar. Die Asset-ID bleibt stabil.

### HLS-Graph ist zyklisch oder zu groß

Expansion stoppt deterministisch, markiert die betroffenen Beziehungen als `truncated` und blockiert destruktive Gruppenaktionen, die Vollständigkeit voraussetzen.

### Blob ist nur auf einem Server ohne Liste vorhanden

Er wird entdeckt, sobald sein Hash aus einer anderen Quelle bekannt wird und die Prüfung positiv ausfällt. Ohne bekannten Hash bleibt er prinzipbedingt unentdeckt.

### Metadaten ändern die Timeline-Sortierung

Ein neu entdecktes vertrauenswürdiges `captured_at` darf die Position ändern. Eine neue Serverprüfung oder `first_seen_at`-Aktualisierung darf sie nicht verändern. Die UI sollte größere nachträgliche Umsortierungen erst nach abgeschlossener Projektionsrunde anwenden.

## Beobachtbarkeit

Jeder Discovery- und Enrichment-Schritt soll klassifizierte Ergebnisse liefern, nicht nur Console-Logs:

- Quelle und Jobtyp;
- Start, Ende und Dauer;
- Zahl gelesener, neuer und unveränderter Entitäten;
- Abbruch- oder Fehlerklasse;
- Retry-Zeitpunkt;
- angewendete Begrenzung;
- betroffene Profil- und Server-ID.

Die Benutzeroberfläche benötigt eine verständliche Zusammenfassung. Technische Details können in einer Diagnoseansicht erscheinen. Es ist keine externe Telemetrie erforderlich, um den lokalen Katalog erklärbar zu machen.

## Phasenweise Implementierung

Jede Phase liefert einen eigenständig nutzbaren vertikalen Ausschnitt. Spätere Phasen dürfen das Datenmodell erweitern, aber nicht frühere Identitäten oder Provenienzregeln brechen.

### Phase 1: Persistenter Hash-Katalog

**Umfang**

- lokale Katalogdatenbank und Migrationen;
- `profile`, `server`, `profile_server`, `blob`, `profile_blob_membership`, `profile_blob_evidence`;
- bestehende Blossom- und NIP-96-Listen als direkte Seeds ingestieren;
- aktuelle Upload- und Mirror-Ergebnisse ingestieren;
- paginierte Läufe mit Cursor und Status speichern;
- Katalogstatus mit Zahl bekannter Hashes anzeigen.

**Noch nicht enthalten**

- Reverse Lookups;
- MIME-spezifische Extraktion;
- Asset-Timeline;
- vollständige historische Verfügbarkeit.

**Akzeptanz**

- Ein Reload verliert die bekannte Hashmenge nicht.
- Jeder Hash besitzt mindestens einen Mitgliedschaftsbeleg.
- Unvollständige Serverlisten werden als unvollständig ausgewiesen.
- Mehrere Serverlisten deduplizieren denselben Blob nach SHA-256.

### Phase 2: Vollständiger Benutzer-Event-Cache

**Umfang**

- relevante Events des aktiven Pubkeys vollständig paginiert laden;
- Events und Relay-Sichtungen persistent speichern;
- `x`, `ox`, URL-, Bild-, Thumbnail-, `imeta`- und Text-Track-Referenzen extrahieren;
- neue direkte und abgeleitete Hash-Seeds erzeugen;
- Replaceable- und Addressable-Versionen nachvollziehen.

**Akzeptanz**

- Mehr als 100 relevante Events werden vollständig und fortsetzbar verarbeitet.
- Offline lässt sich erklären, welches Event welchen Hash in den Katalog eingebracht hat.
- Eine erneute Synchronisation erzeugt keine Duplikate.
- Änderungen an Extraktionsregeln können gespeicherte Events ohne erneuten Relay-Download reprojizieren.

### Phase 3: Serververfügbarkeit und Historie

**Umfang**

- `blob_location` und `blob_location_history`;
- bekannte Hashes auf aktiven Servern mit `HEAD` prüfen;
- Zustände differenzieren;
- TTL, Backoff und begrenzte Parallelität;
- Server ohne Listenfunktion vollständig als Prüfziele einbeziehen;
- Sunset, MIME-Type, Größe und Range-Unterstützung beobachten.

**Akzeptanz**

- Für jeden bekannten Hash ist pro aktivem Server ein aktueller oder geplanter Prüfzustand vorhanden.
- Wiederholte identische Prüfungen blähen die Historie nicht auf.
- `404`, Netzwerkfehler und fehlende Berechtigung sind unterscheidbar.
- Bouquet kann „erstmals gesehen“, „zuletzt gesehen“ und relevante Zustandswechsel anzeigen.

### Phase 4: Reverse Lookup und kontrollierte Expansion

**Umfang**

- bekannte Hashes in Batches per `#x` suchen;
- gefundene Events vollständig cachen;
- zusätzliche Metadaten und klar rollengebundene Begleitblobs aufnehmen;
- Expansionsbudget, Tiefe, Zykluserkennung und Truncation persistieren.

**Akzeptanz**

- Ein bekannter Hash kann mit allen gefundenen beschreibenden Events angezeigt werden.
- Fremde Events lösen keinen unbeschränkten Crawl aus.
- Jeder zusätzlich aufgenommene Hash besitzt eine vollständige Belegkette zu einem direkten Seed.
- Unterbrochene Lookups werden fortgesetzt statt neu begonnen.

### Phase 5: MIME- und Manifest-Enrichment

**Umfang**

- versionierte Extraktor-Jobs;
- allgemeine, Bild-, Audio-, Video- und Dokumentmetadaten;
- vorhandenen ID3-Cache in das allgemeine Modell überführen;
- HLS-Playlists und Nachkommen persistent modellieren;
- kleine Previews bedarfsgesteuert erzeugen oder übernehmen.

**Akzeptanz**

- Derselbe Blob wird pro Extraktorversion höchstens einmal erfolgreich verarbeitet.
- Große Dateien werden nicht ohne Priorisierung und Kostenentscheidung vollständig geladen.
- HLS-Graphen überleben Reloads und zeigen `complete`, `failed` oder `truncated`.
- Metadatenkonflikte bleiben samt Quelle nachvollziehbar.

### Phase 6: Asset-Projection

**Umfang**

- Assets und Renditions aus Events, Root-Blobs und Beziehungen ableiten;
- stabile Asset-Identitäten und Aliase;
- Feldspezifische Prioritätsregeln;
- `timeline_projection` materialisieren;
- unsortierte und mehrdeutige Fälle sichtbar machen.

**Akzeptanz**

- Ein HLS-Video erscheint als ein Asset statt als viele Segmente.
- Thumbnail und Untertitel erscheinen nicht als eigenständige Timeline-Assets.
- Ein alleinstehender Blob bleibt als synthetisches Asset sichtbar.
- Jede Projection kann auf gespeicherte Fakten und Belege zurückgeführt werden.

### Phase 7: Medien-Timeline

**Umfang**

- gruppierte, virtualisierte Timeline;
- Filter nach Typ, Datum, Verfügbarkeit und Metadatenstatus;
- progressive Previews und Enrichment-Zustände;
- Asset-Detailansicht;
- Unsortiert- und Problemansichten;
- technische Ansichten weiterhin erreichbar.

**Akzeptanz**

- Große Kataloge werden ohne vollständiges Laden aller Karten bedienbar dargestellt.
- Timeline-Sortierung folgt dem dokumentierten Zeitmodell.
- Fehlende Medien bleiben über Metadaten sichtbar und erklärbar.
- Technische Hash- und Serverinformationen dominieren die Hauptansicht nicht.

### Phase 8: Asset-bezogene Verwaltung

**Umfang**

- Vollständigkeit pro Asset und Server;
- sichere Aktionsplanung für Mirror, Sync und Delete;
- Vorschau aller betroffenen technischen Blobs;
- Schutz vor Aktionen auf unvollständigen oder mehrdeutigen Graphen.

**Akzeptanz**

- Bouquet kann vor einer Aktion exakt erklären, welche Blobs und Server betroffen sind.
- Destruktive Gruppenaktionen sind bei `unknown`, `ambiguous` oder `truncated` blockiert.
- Ein Mirror-Plan kann fehlende Teile eines zusammengesetzten Assets bestimmen.

## Entscheidungsbedarf vor Phase 1

Vor der ersten Implementierung müssen nur wenige Entscheidungen feststehen:

1. Welche lokale IndexedDB-Abstraktion wird verwendet?
2. Wie werden Schema-Migrationen und ein vollständiger Rebuild ausgelöst?
3. Welche aktuellen Serverlisten- und NIP-96-Daten gelten als direkte Seeds?
4. Welche Event-Kinds bilden den garantierten ersten Umfang?
5. Welche Größen- und Zeitbudgets gelten für Hintergrundjobs?

Nicht vorab entschieden werden müssen alle späteren MIME-Extraktoren, die endgültige Timeline-Gestaltung oder ein mögliches Backend. Die Katalog-Seam und die gespeicherte Provenienz halten diese Entscheidungen reversibel.

## Beziehung zum bestehenden Code

Der Entwurf baut auf vorhandenen Fähigkeiten auf:

- `useServerInfo` liefert bereits Serverinventare und eine flüchtige Hash-Distribution.
- `useFileMetaEvents` kennt bereits relevante Event-Kinds und extrahiert mehrere Hashquellen.
- `blobRelationshipGraph` modelliert bereits Event-, Blob-, Playlist- und Segmentbeziehungen mit Provenienz.
- `useBlobRelationshipGraph` zeigt notwendige Fetch-, Tiefen- und Nachkommensgrenzen.
- `id3` demonstriert bereits inhaltsbasierte Metadatenextraktion und lokalen Cache.
- der Nostr-Core verwendet bereits IndexedDB für Eventpersistenz.

Die Implementierung soll diese Logik nicht als zweite parallele Konvention duplizieren. Die bestehenden Extraktions- und Graphregeln werden schrittweise hinter das Katalog-Modul verlagert und anschließend von der bisherigen Relationship-Ansicht sowie der neuen Timeline gemeinsam konsumiert.

## Referenzen

- Blossom-Spezifikation und BUD-Übersicht: <https://github.com/hzrd149/blossom>
- BUD-01, Blob-Abruf, `HEAD`, Range und Sunset: <https://github.com/hzrd149/blossom/blob/master/buds/01.md>
- BUD-08, NIP-94-Metadaten in Blob Descriptors: <https://github.com/hzrd149/blossom/blob/master/buds/08.md>
- BUD-12, optionale und nicht empfohlene Listenfunktion: <https://github.com/hzrd149/blossom/blob/master/buds/12.md>
- Blossom HLS Video Formatting: <https://github.com/hzrd149/blossom/blob/master/implementations/hls-video-formatting.md>
- NIP-94 File Metadata: <https://github.com/nostr-protocol/nips/blob/master/94.md>
- Bestehender Bouquet-Entwurf: `docs/superpowers/specs/2026-06-18-blob-relationship-tree-design.md`
