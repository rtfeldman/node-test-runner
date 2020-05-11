module Elm.License exposing
  ( License
  , bsd3
  , toDetails
  , osiApprovedSpdxLicenses
  , toString
  , fromString
  , encode
  , decoder
  )


{-| The `elm.json` for packages always has a `"license"` field. That field
must contain an OSI approved license in the [SPDX](https://spdx.org/licenses/) format.

This module helps verify that licenses are acceptable.


# Licenses
@docs License, bsd3, toDetails, osiApprovedSpdxLicenses

# String Conversions
@docs toString, fromString

# JSON Conversions
@docs encode, decoder
-}


import Dict
import Json.Decode as D
import Json.Encode as E



-- CONSTRAINT


{-| An OSI approved license in the [SPDX](https://spdx.org/licenses/) format.
It is impossible to construct an invalid `License` value.
-}
type License =
  License String String


{-| Easy access to a license commonly used in the Elm ecosystem.

  - `name` = `BSD 3-clause "New" or "Revised" License`
  - `spdx` = `BSD-3-Clause`

-}
bsd3 : License
bsd3 =
  License "BSD-3-Clause" "BSD 3-clause \"New\" or \"Revised\" License"



-- STRINGS


{-| Convert a `License` to its SPDX abbreviation:

    toString bsd3 == "BSD-3-Clause"
-}
toString : License -> String
toString (License spdx _) =
  spdx


{-| Convert an arbitrary `String` into a `License`:

    fromString "BSD-3-Clause" == Just bsd3
    fromString "BSD3"         == Nothing

Notice that this function only succeds when given an OSI approved license
in its SPDX abbreviation. Go [here](https://spdx.org/licenses/) for a full
list of such licenses.
-}
fromString : String -> Maybe License
fromString string =
  Dict.get string spdxDict


spdxDict : Dict.Dict String License
spdxDict =
  Dict.fromList <|
    List.map (\(License abbr _ as license) -> (abbr, license)) osiApprovedSpdxLicenses



-- JSON


{-| Encode a `License` into a SPDX string for use in `elm.json`
-}
encode : License -> E.Value
encode constraint =
  E.string (toString constraint)


{-| Decode a SPDX string from `elm.json` into a `License`
-}
decoder : D.Decoder License
decoder =
  D.andThen decoderHelp D.string


decoderHelp : String -> D.Decoder License
decoderHelp string =
  case fromString string of
    Just license ->
      D.succeed license

    Nothing ->
      D.fail "I need an OSI approved license in SPDX format <https://spdx.org/licenses/>"



-- UTILITIES


{-| Extract the common `name` of a `License`, along with its standardized
`spdx` abbreviation.

    toDetails bsd3
    -- { name = "BSD 3-clause \"New\" or \"Revised\" License"
    -- , spdx = "BSD-3-Clause"
    -- }
-}
toDetails : License -> { name : String, spdx : String }
toDetails (License spdx name) =
  { name = name, spdx = spdx }


{-| OSI approved licenses in [SPDX format](https://spdx.org/licenses/).
-}
osiApprovedSpdxLicenses : List License
osiApprovedSpdxLicenses =
  [ License "AFL-1.1" "Academic Free License v1.1"
  , License "AFL-1.2" "Academic Free License v1.2"
  , License "AFL-2.0" "Academic Free License v2.0"
  , License "AFL-2.1" "Academic Free License v2.1"
  , License "AFL-3.0" "Academic Free License v3.0"
  , License "APL-1.0" "Adaptive Public License 1.0"
  , License "Apache-1.1" "Apache License 1.1"
  , License "Apache-2.0" "Apache License 2.0"
  , License "APSL-1.0" "Apple Public Source License 1.0"
  , License "APSL-1.1" "Apple Public Source License 1.1"
  , License "APSL-1.2" "Apple Public Source License 1.2"
  , License "APSL-2.0" "Apple Public Source License 2.0"
  , License "Artistic-1.0" "Artistic License 1.0"
  , License "Artistic-1.0-Perl" "Artistic License 1.0 (Perl)"
  , License "Artistic-1.0-cl8" "Artistic License 1.0 w/clause 8"
  , License "Artistic-2.0" "Artistic License 2.0"
  , License "AAL" "Attribution Assurance License"
  , License "BSL-1.0" "Boost Software License 1.0"
  , License "BSD-2-Clause" "BSD 2-clause \"Simplified\" License"
  , License "BSD-3-Clause" "BSD 3-clause \"New\" or \"Revised\" License"
  , License "0BSD" "BSD Zero Clause License"
  , License "CECILL-2.1" "CeCILL Free Software License Agreement v2.1"
  , License "CNRI-Python" "CNRI Python License"
  , License "CDDL-1.0" "Common Development and Distribution License 1.0"
  , License "CPAL-1.0" "Common Public Attribution License 1.0"
  , License "CPL-1.0" "Common Public License 1.0"
  , License "CATOSL-1.1" "Computer Associates Trusted Open Source License 1.1"
  , License "CUA-OPL-1.0" "CUA Office Public License v1.0"
  , License "EPL-1.0" "Eclipse Public License 1.0"
  , License "ECL-1.0" "Educational Community License v1.0"
  , License "ECL-2.0" "Educational Community License v2.0"
  , License "EFL-1.0" "Eiffel Forum License v1.0"
  , License "EFL-2.0" "Eiffel Forum License v2.0"
  , License "Entessa" "Entessa Public License v1.0"
  , License "EUDatagrid" "EU DataGrid Software License"
  , License "EUPL-1.1" "European Union Public License 1.1"
  , License "Fair" "Fair License"
  , License "Frameworx-1.0" "Frameworx Open License 1.0"
  , License "AGPL-3.0" "GNU Affero General Public License v3.0"
  , License "GPL-2.0" "GNU General Public License v2.0 only"
  , License "GPL-3.0" "GNU General Public License v3.0 only"
  , License "LGPL-2.1" "GNU Lesser General Public License v2.1 only"
  , License "LGPL-3.0" "GNU Lesser General Public License v3.0 only"
  , License "LGPL-2.0" "GNU Library General Public License v2 only"
  , License "HPND" "Historic Permission Notice and Disclaimer"
  , License "IPL-1.0" "IBM Public License v1.0"
  , License "Intel" "Intel Open Source License"
  , License "IPA" "IPA Font License"
  , License "ISC" "ISC License"
  , License "LPPL-1.3c" "LaTeX Project Public License v1.3c"
  , License "LiLiQ-P-1.1" "Licence Libre du Québec – Permissive version 1.1"
  , License "LiLiQ-Rplus-1.1" "Licence Libre du Québec – Réciprocité forte version 1.1"
  , License "LiLiQ-R-1.1" "Licence Libre du Québec – Réciprocité version 1.1"
  , License "LPL-1.02" "Lucent Public License v1.02"
  , License "LPL-1.0" "Lucent Public License Version 1.0"
  , License "MS-PL" "Microsoft Public License"
  , License "MS-RL" "Microsoft Reciprocal License"
  , License "MirOS" "MirOS Licence"
  , License "MIT" "MIT License"
  , License "Motosoto" "Motosoto License"
  , License "MPL-1.0" "Mozilla Public License 1.0"
  , License "MPL-1.1" "Mozilla Public License 1.1"
  , License "MPL-2.0" "Mozilla Public License 2.0"
  , License "MPL-2.0-no-copyleft-exception" "Mozilla Public License 2.0 (no copyleft exception)"
  , License "Multics" "Multics License"
  , License "NASA-1.3" "NASA Open Source Agreement 1.3"
  , License "Naumen" "Naumen Public License"
  , License "NGPL" "Nethack General Public License"
  , License "Nokia" "Nokia Open Source License"
  , License "NPOSL-3.0" "Non-Profit Open Software License 3.0"
  , License "NTP" "NTP License"
  , License "OCLC-2.0" "OCLC Research Public License 2.0"
  , License "OGTSL" "Open Group Test Suite License"
  , License "OSL-1.0" "Open Software License 1.0"
  , License "OSL-2.0" "Open Software License 2.0"
  , License "OSL-2.1" "Open Software License 2.1"
  , License "OSL-3.0" "Open Software License 3.0"
  , License "OSET-PL-2.1" "OSET Public License version 2.1"
  , License "PHP-3.0" "PHP License v3.0"
  , License "PostgreSQL" "PostgreSQL License"
  , License "Python-2.0" "Python License 2.0"
  , License "QPL-1.0" "Q Public License 1.0"
  , License "RPSL-1.0" "RealNetworks Public Source License v1.0"
  , License "RPL-1.1" "Reciprocal Public License 1.1"
  , License "RPL-1.5" "Reciprocal Public License 1.5"
  , License "RSCPL" "Ricoh Source Code Public License"
  , License "OFL-1.1" "SIL Open Font License 1.1"
  , License "SimPL-2.0" "Simple Public License 2.0"
  , License "Sleepycat" "Sleepycat License"
  , License "SISSL" "Sun Industry Standards Source License v1.1"
  , License "SPL-1.0" "Sun Public License v1.0"
  , License "Watcom-1.0" "Sybase Open Watcom Public License 1.0"
  , License "UPL-1.0" "Universal Permissive License v1.0"
  , License "NCSA" "University of Illinois/NCSA Open Source License"
  , License "VSL-1.0" "Vovida Software License v1.0"
  , License "W3C" "W3C Software Notice and License (2002-12-31)"
  , License "Xnet" "X.Net License"
  , License "Zlib" "zlib License"
  , License "ZPL-2.0" "Zope Public License 2.0"
  ]
