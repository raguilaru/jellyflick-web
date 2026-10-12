# Project Jellyflick

## Constraints
- I want to create a jellyfin web client that takes heavy inspiration from the best-known streaming service, so it feels familiar to the user. However, avoid using any reference to that service anywhere in the code.
- Initially and in the scope of this project, this will be a web client. However, we need to architect the app in a way that with small tweaks, we can make an app for LG tv OS. It's important that this version is as lightweight as possible in order for a future lg tvos version to be installed on older tvs. It's important that the client is as lightweight as possible, so when we decide to port
- It must take advantage of the latest features from jellyfin. Avoid legacy or deprecated api. Look for a jellyfin way of using the API. Only if not possible, new functionality in the client must be created to achieve the expected result.

## Features
- Take inspiration from both UI/UX and functionality such as suggestions, Continue watching, genres, seasons, etc.
- The home screen must have a big element such as continue watching, or suggestions. Use the one that service uses by default.
- The other element when user scroll down can be customized on a user basis by the settings (adding or hiding features from home screen, and modifying the order). However these element must be smaller than the main element. This means that all the elements that service shows in the main home screen must also have a small version that the user can add as a secondary one.
- I am not familiar with what that service shows as the big main element, so please ask me what they can possibly be before adding them as functionality since some of them might not make sense for Jellyfin, such as "notify me" when a new season or movie will come out in the future.
- The app must support multiple users. If more than one user has signed in, a screen showing a user selection must be shown.
- Add information regarding show or movie rating based on multiple popular online databases such as roten tomatoes.
The app must scale well for mobile users, so help me figure out the best approach so it looks as similar as possible to that service.
