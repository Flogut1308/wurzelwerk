# Fixture „kaputte-kodierung"

Vier Namenszeilen mit absichtlich kaputten Zeichenketten: doppelt fehlinterpretiertes UTF-8
("MÃ¼ller" statt "Müller", "SchrÃ¶der" statt "Schröder" — der klassische GEDCOM-Kodierungsfehler),
ein nicht mehr rekonstruierbares Unicode-Ersatzzeichen (U+FFFD) mitten im Namen, und ein Token, das
lateinische und kyrillische Zeichen als Homoglyphen mischt (sieht aus wie "Paul", ist es
zeichengenau nicht). Trägt jeden Test von Suchnormalform, Kölner Phonetik und späterem
Importvertrag, der mit echt kaputten Quelldaten klarkommen muss, statt nur mit sauberem UTF-8 —
insbesondere: kein Absturz, keine stillschweigende "Reparatur" ohne Kenntnis der Originalkodierung.
