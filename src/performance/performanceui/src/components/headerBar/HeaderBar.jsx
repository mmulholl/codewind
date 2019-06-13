/*******************************************************************************
* Copyright (c) 2019 IBM Corporation and others.
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the Eclipse Public License v2.0
* which accompanies this distribution, and is available at
* http://www.eclipse.org/legal/epl-v20.html
* 
* Contributors:
*     IBM Corporation - initial API and implementation
*******************************************************************************/

import React, { } from 'react'
import * as AppConstants from '../../AppConstants';
import LanguageSwitcher from '../localeSwitcher/LocaleSwitcher';

// TEMP REMOVAL import logo from '../../theme/microclimate-logo.svg';
import './HeaderBar.scss';

export default class HeaderBar extends React.Component {
    // eslint-disable-next-line class-methods-use-this
    render() {
        return (
            <div className="HeaderBar">
                {/* TEMP REMOVAL <img src={logo} className="AppLogo" alt={AppConstants.appName} /> */}
                <div className="AppLogo">{AppConstants.appName}</div>
                <div className="right"><LanguageSwitcher /></div>
            </div>
        )
    }
}
