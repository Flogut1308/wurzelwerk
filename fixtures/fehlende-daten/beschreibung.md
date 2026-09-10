# Fixture „fehlende-daten"

Zwei Personen mit möglichst wenig ausgefüllten Feldern: eine Person ohne Geschlecht und ohne
Lebend-Status, mit nur einem Vornamen (kein Nachname, keine Schrift); ein Platzhalter-Vorfahre ganz
ohne eigenen Namenseintrag, verbunden über eine Elternschaft vom Typ `unbekannt` ohne Konfidenz.
Trägt jeden Test, der `NULL`/fehlende Werte in Suchindex (`suchnormalform`/`koelner_phonetik` auf
`NULL`-Namensfeldern), Anzeige (keine Namenszeile für eine Person) und Layout (Knoten ohne Text)
robust behandeln muss, statt stillschweigend eine Pflichtangabe anzunehmen, die das Schema gar
nicht erzwingt.
