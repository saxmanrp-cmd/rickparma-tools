# Fuel iPhone / Apple Health bridge

This folder contains the native iOS shell for Fuel. The shell loads the existing Fuel web app in `WKWebView` and exposes a narrow `healthKit` JavaScript bridge to the page.

## Data currently read from Apple Health

- Steps today
- Active energy burned today
- Walking/running distance today
- Most recent resting heart rate
- Sleep duration from the last 18 hours
- Most recent body weight

If a smart ring writes compatible data into Apple Health, Fuel reads that data through HealthKit without needing a ring-specific integration.

## Native setup

The app targets iOS 17+. HealthKit entitlement and `NSHealthShareUsageDescription` are included. `project.yml` is provided for XcodeGen so an Xcode project can be generated on a Mac with `xcodegen generate` from this directory.

The app still needs an Apple Developer signing team selected in Xcode before it can be installed on an iPhone. HealthKit authorization must be tested on a physical iPhone; the web app by itself cannot access Apple Health.

## Bridge API

The web app sends messages to `window.webkit.messageHandlers.healthKit` using `WKScriptMessageHandlerWithReply`.

Supported actions:

- `{ action: "authorize" }`
- `{ action: "today" }`

The web layer stores the most recent Health snapshot in localStorage and displays it on the Progress page.
