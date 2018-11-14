# Work with `elm.json` and `docs.json`

This package is meant for people creating Elm tooling, like editor plugins. If you just want to make stuff in Elm, there is nothing here for you.

Both `package.elm-lang.org` and `elm reactor` needed the functionality provided by this package, and over time, it became clear that this subset can be reasonably shared.


## Finding Metadata Files

Elm creates a per-user cache of package information. **This cache is READ-ONLY. Do not modify or add files to it.** Inside the cache, you have the `elm.json` and `docs.json` for every package that has been downloaded and built. This means you can just read them locally and do whatever sort of visualization or analysis you want.

> **Note:** The per-user cache of package information lives at the directory specified in the `ELM_HOME` environment variable. If this environment variable is not set, it defaults to  `~/.elm/` on UNIX systems and `C:/Users/<user>/AppData/Roaming/elm` on Windows. Again, **do not modify or add files in `ELM_HOME` for your work** because:
>
>  1. It will be very confusing and frustrating if this cache is corrupted.
>  2. This cache is cleared very infrequently, so it should be as small as possible.
>
> If you need to cache information for your plugin, it is better to find a *separate* solution. Use the local `elm-stuff/` directory so that it is easy for users to (1) delete if there is a problem and (2) reclaim the storage.