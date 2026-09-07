import { Component, type ErrorInfo, type ReactNode } from 'react'
import { aufrufen } from '../brücke/aufrufen'
import { i18n } from '../i18n/einrichten'

interface FehlergrenzeProps {
  readonly children: ReactNode
}

interface FehlergrenzeState {
  readonly hatFehler: boolean
}

/**
 * React-Fehlergrenze (§10.3): fängt einen Absturz in ihrem Teilbaum ab, zeigt eine lokale
 * Rückfallanzeige und meldet den Fehler an den Hauptprozess (`befehl:protokoll.melden`), damit er
 * in derselben Protokolldatei landet wie alles andere. Der Text kommt über die benannte
 * i18next-Instanz aus `../i18n/einrichten`, nicht über `useTranslation` — eine Klassenkomponente
 * hat keinen Hook-Kontext, und der Text muss auch außerhalb eines erfolgreichen Renders verfügbar
 * sein (ADR-011, AP-0.3).
 */
export class Fehlergrenze extends Component<FehlergrenzeProps, FehlergrenzeState> {
  public override state: FehlergrenzeState = { hatFehler: false }

  public static getDerivedStateFromError(): FehlergrenzeState {
    return { hatFehler: true }
  }

  public override componentDidCatch(fehler: Error, info: ErrorInfo): void {
    const stack = info.componentStack
    void aufrufen('befehl:protokoll.melden', {
      quelle: 'fehlergrenze',
      nachricht: fehler.message,
      ...(stack !== null && stack !== undefined ? { stack } : {}),
    })
  }

  public override render(): ReactNode {
    if (this.state.hatFehler) {
      return <div role="alert">{i18n.t('allgemein:fehlergrenze')}</div>
    }
    return this.props.children
  }
}
