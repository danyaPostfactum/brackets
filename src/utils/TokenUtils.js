/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, CodeMirror */

/**
 * Functions for iterating through tokens in the current editor buffer. Useful for doing
 * light parsing that can rely purely on information gathered by the code coloring mechanism.
 */

define(function (require, exports, module) {
    "use strict";
    
   /**
     * Creates a context object for the given editor and position, suitable for passing to the
     * move functions.
     * @param {CodeMirror} editor
     * @param {{ch:{string}, line:{number}} pos
     * @return {editor:{CodeMirror}, pos:{ch:{string}, line:{number}}, token:{object}}
     */
    function getInitialContext(editor, pos) {
        return {
            "editor": editor,
            "pos": pos,
            "token": editor.session.getTokenAt(pos.row, pos.column)
        };
    }
    
    /**
     * Moves the given context backwards by one token.
     * @param {editor:{CodeMirror}, pos:{ch:{string}, line:{number}}, token:{object}} ctx
     * @return {boolean} whether the context changed
     */
    function movePrevToken(ctx) {
        if (ctx.pos.column <= 0 || ctx.token.start <= 0) {
            //move up a line
            if (ctx.pos.row <= 0) {
                return false; //at the top already
            }
            ctx.pos.row--;
            ctx.pos.column = ctx.editor.session.getLine(ctx.pos.row).length;
        } else {
            ctx.pos.column = ctx.token.start;
        }
        ctx.token = ctx.editor.session.getTokenAt(ctx.pos.row, ctx.pos.column);
        return true;
    }
    
    /**
     * Moves the given context forward by one token.
     * @param {editor:{CodeMirror}, pos:{ch:{string}, line:{number}}, token:{object}} ctx
     * @return {boolean} whether the context changed
     */
    function moveNextToken(ctx) {
        var eol = ctx.editor.session.getLine(ctx.pos.row).length;
        if (ctx.pos.column >= eol || ctx.token.start + ctx.token.value.length >= eol) {
            //move down a line
            if (ctx.pos.row >= ctx.editor.session.getLength() - 1) {
                return false; //at the bottom
            }
            ctx.pos.row++;
            ctx.pos.column = 0;
        } else {
            ctx.pos.column = ctx.token.start + ctx.token.value.length + 1;
        }
        ctx.token = ctx.editor.session.getTokenAt(ctx.pos.row, ctx.pos.column);
        return true;
    }
    
   /**
     * Moves the given context in the given direction, skipping any whitespace it hits.
     * @param {function} moveFxn the function to move the context
     * @param {editor:{CodeMirror}, pos:{ch:{string}, line:{number}}, token:{object}} ctx
     * @return {boolean} whether the context changed
     */
    function moveSkippingWhitespace(moveFxn, ctx) {
        if (!moveFxn(ctx)) {
            return false;
        }
        while (ctx.token && !ctx.token.type && ctx.token.string.trim().length === 0) {
            if (!moveFxn(ctx)) {
                return false;
            }
        }
        return true;
    }

    /**
     * In the given context, get the character offset of pos from the start of the token.
     * @param {editor:{CodeMirror}, pos:{ch:{string}, line:{number}}, token:{object}} context
     * @return {number}
     */
    function offsetInToken(ctx) {
        var offset = ctx.pos.column - (ctx.token ? ctx.token.start : 0);
        if (offset < 0) {
            console.log("CodeHintUtils: _offsetInToken - Invalid context: pos not in the current token!");
        }
        return offset;
    }

    /**
     * Returns the mode object and mode name string at a given position
     * @param {CodeMirror} cm CodeMirror instance
     * @param {line:{number}, ch:{number}} pos Position to query for mode
     * @return {mode:{Object}, name:string}
     */
    function getModeAt(cm, pos) {
        var outerMode = cm.getMode(),
            modeData = CodeMirror.innerMode(outerMode, cm.getTokenAt(pos, true).state),
            name;

        name = (modeData.mode.name === "xml") ?
                modeData.mode.configuration : modeData.mode.name;

        return {mode: modeData.mode, name: name};
    }

    exports.movePrevToken           = movePrevToken;
    exports.moveNextToken           = moveNextToken;
    exports.moveSkippingWhitespace  = moveSkippingWhitespace;
    exports.getInitialContext       = getInitialContext;
    exports.offsetInToken           = offsetInToken;
    exports.getModeAt               = getModeAt;
});
