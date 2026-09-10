# Fixture „kyrillisch-polnisch"

Ein kyrillischer Name mit bereits erzeugtem ISO-9-Umschrift-Eintrag (`typ: transliteriert`,
`umschrift_von` zeigt zurück auf das Original, nie `ist_bevorzugt`), eine kyrillische
Patronymik-Flexion beim Kind (Nachname der Tochter endet weiblich auf `-a`), und zwei polnische
Namen mit vollem diakritischem Zeichensatz (Ł, ś, Ż, ó, ć) — sauberes UTF-8, bewusst KEIN Mojibake
(Abgrenzung zur Fixture „kaputte-kodierung"). Trägt jeden Test von Suchnormalform, Kölner Phonetik
und der späteren ISO-9-Rückumschrift (AP-1.2, ADR-014: `zurueck(iso9(s)) === s`), der mit echten
nicht-lateinischen und diakritischen Zeichen statt nur mit ASCII arbeiten muss.
