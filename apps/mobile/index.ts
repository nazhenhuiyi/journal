import 'react-native-gesture-handler'
import './global.css'
import { registerRootComponent } from 'expo'
import { createElement } from 'react'
import { Platform } from 'react-native'
import { registerWidgetTaskHandler } from 'react-native-android-widget'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import App from './src/App'
import { widgetTaskHandler } from './src/widgets/widgetTaskHandler'

function RootApp() {
  return createElement(KeyboardProvider, null, createElement(App))
}

registerRootComponent(RootApp)

if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler)
}
