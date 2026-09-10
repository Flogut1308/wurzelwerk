# Fixture „cousinenheirat"

Ein Enkelkind, dessen Eltern Cousin und Cousine ersten Grades sind (ihre jeweiligen Eltern
Vaterlinie/Mutterlinie sind Geschwister, Kinder von Großvater und Großmutter). Das Enkelkind
erreicht Großvater und Großmutter über zwei unabhängige Abstammungspfade — echter Ahnenimplex: der
Elterngraph ist weiterhin ein zyklenfreier DAG (`hatZyklus` muss `false` liefern), aber kein Baum
mehr (dieselben Vorfahren tauchen im Stammbaum zweimal auf). Trägt jeden Test, der annimmt,
`hatZyklus` (bzw. eine ungerichtete Kreisprüfung) dürfe bei Cousinenheirat nicht anschlagen, und
jeden Layout-Test, der zwei Pfade zu denselben Vorfahren sauber darstellen muss statt sie
fälschlich zu deduplizieren.
