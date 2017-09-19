// ported from https://github.com/elm-lang/elm-compiler/blob/375ed593e43cf73886328091afbf8688a094cb3f/src/AST/Module.hs

// HEADERS FOR PARSING


/* Basic info needed to identify modules and determine dependencies. */
enum Header<Imports> {
  Header
    { decl : Option<HeaderDecl>
    , imports : Imports
    }
}


enum HeaderDecl {
  HeaderDecl
    { tag : SourceTag
    , name : Name.Raw
    , exports : Exposing.Raw
    , settings : SourceSettings
    , docs : A.Located (Maybe Text)
    }
}

//
// defaultHeaderDecl :: HeaderDecl
// defaultHeaderDecl =
//   let
//     zero = R.Position 1 1
//     noDocs = A.at zero zero Nothing
//   in
//     HeaderDecl Normal "Main" Exposing.Open emptySettings noDocs
//
//
//
// // MODULES
//
//
// data Module phase =
//   Module
//     { name :: Name.Canonical
//     , info :: phase
//     }
//
//
// type Source =
//   Module SourceInfo
//
//
// data SourceInfo =
//   Source
//     { srcTag :: SourceTag
//     , srcSettings :: SourceSettings
//     , srcDocs :: A.Located (Maybe Text)
//     , srcExports :: Exposing.Raw
//     , srcImports :: [UserImport]
//     , srcDecls :: [Decl.Source]
//     }
//
//
// data SourceTag
//   = Normal
//   | Effect R.Region
//   | Port R.Region
//
//
// type SourceSettings =
//   A.Located [(A.Located Text, A.Located Text)]
//
//
// emptySettings :: SourceSettings
// emptySettings =
//   A.A (error "region of empty settings should not be needed") []
//
//
// type Valid =
//   Module ValidInfo
//
//
// data ValidInfo =
//   Valid
//     { validDocs :: A.Located (Maybe Text)
//     , validExports :: Exposing.Raw
//     , validImports :: ([DefaultImport], [UserImport])
//     , validDecls :: Decl.Valid
//     , validEffects :: Effects.Raw
//     }
//
//
// type Canonical =
//   Module (Info Canonical.Expr)
//
//
// type Optimized =
//   Module (Info [(Text, Optimized.Decl)])
//
//
//
// // IMPORTS
//
//
// type UserImport = A.Located (A.Located Name.Raw, ImportMethod)
//
//
// type DefaultImport = (Name.Raw, ImportMethod)
//
//
// data ImportMethod =
//   ImportMethod
//     { alias :: Maybe Text
//     , exposedVars :: !Exposing.Raw
//     }
//
//
//
// // LATE PHASE MODULE INFORMATION
//
//
// data Info program =
//   Info
//     { docs :: A.Located (Maybe Docs.Centralized)
//     , exports :: Exposing.Canonical
//     , imports :: [Name.Raw]
//     , program :: program
//     , types :: Types
//     , fixities :: [Decl.Infix]
//     , aliases :: Aliases
//     , unions :: Unions
//     , effects :: Effects.Canonical
//     }
//
//
// type Types =
//   Map.Map Text Type.Canonical
//
//
// type Aliases =
//   Map.Map Text ([Text], Type.Canonical)
//
//
// type Unions =
//   Map.Map Text (UnionInfo Text)
//
//
// type UnionInfo v =
//   ( [Text], [(v, [Type.Canonical])] )
//
//
// type CanonicalUnion =
//   ( Var.Canonical, UnionInfo Var.Canonical )
//
//
//
// // INTERFACES
//
//
// type Interfaces =
//   Map.Map Name.Canonical Interface
//
//
// {-| Key facts about a module, used when reading info from .elmi files. -}
// data Interface =
//   Interface
//     { iExports  :: Exposing.Canonical
//     , iImports  :: [Name.Raw] // TODO perhaps use this to crawl faster
//     , iTypes    :: Types
//     , iUnions   :: Unions
//     , iAliases  :: Aliases
//     , iFixities :: [Decl.Infix]
//     }
//
//
// toInterface :: Optimized -> Interface
// toInterface (Module _ myInfo) =
//   Interface
//     { iExports  = exports myInfo
//     , iImports  = imports myInfo
//     , iTypes    = types myInfo
//     , iUnions   = unions myInfo
//     , iAliases  = aliases myInfo
//     , iFixities = fixities myInfo
//     }
//
//
// privatize :: Interface -> Maybe Interface
// privatize (Interface _ _ _ myUnions myAliases _) =
//   if Map.null myUnions && Map.null myAliases then
//     Nothing
//
//   else
//     Just $ Interface
//       { iExports  = Exposing.nothing
//       , iImports  = []
//       , iTypes    = Map.empty
//       , iUnions   = myUnions
//       , iAliases  = myAliases
//       , iFixities = []
//       }
//
//
// instance Binary Interface where
//   get =
//     Interface <$> get <*> get <*> get <*> get <*> get <*> get
//
//   put modul =
//     do  put (iExports modul)
//         put (iImports modul)
//         put (iTypes modul)
//         put (iUnions modul)
//         put (iAliases modul)
//         put (iFixities modul)
