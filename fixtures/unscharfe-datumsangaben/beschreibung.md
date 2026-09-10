# Fixture „unscharfe-datumsangaben"

Vier Ereignisse, die die volle Bandbreite unscharfer Datumsangaben aus dem Datenmodell zeigen: ein
geschätztes Jahr ("um 1750"), ein echtes Von-bis-Intervall ("zwischen 1810 und 1815"), eine
Doppeldatierung Julianisch/Gregorianisch mit Jahreswechsel ("18. Februar 1750/51, a.st.") und eine
Jahrzehnt-Präzision ("in den 1750er Jahren"). Trägt jeden Test der Datumsspalten
(`datum_modifikator`/`datum_praezision`/`datum_originaltext`/`datum_zweitkalender`/
`datum_doppeljahr`), bevor der eigentliche Datumsparser (AP-1.1) existiert — insbesondere: das
Schema muss diese vier Fälle klaglos speichern, unabhängig davon, ob sie schon sortierbar sind.
