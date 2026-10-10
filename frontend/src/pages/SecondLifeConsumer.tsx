/**
 * SecondLifeConsumer — Deprecated / Redirects to Battery Recycling & Recovery
 *
 * This marketplace view has been superseded by the Battery Recycling & Recovery Hub (/recycling/dashboard).
 */

import { Navigate } from 'react-router-dom'

export default function SecondLifeConsumer() {
  return <Navigate to="/recycling/dashboard" replace />
}
