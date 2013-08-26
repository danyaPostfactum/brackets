/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

ace.define('ace/mode/css', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/text', 'ace/tokenizer', 'ace/mode/css_highlight_rules', 'ace/mode/matching_brace_outdent', 'ace/worker/worker_client', 'ace/mode/behaviour/css', 'ace/mode/folding/cstyle', 'ace/mode/css_completions'], function(require, exports, module) {


var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var Tokenizer = require("../tokenizer").Tokenizer;
var CssHighlightRules = require("./css_highlight_rules").CssHighlightRules;
var MatchingBraceOutdent = require("./matching_brace_outdent").MatchingBraceOutdent;
var WorkerClient = require("../worker/worker_client").WorkerClient;
var CssBehaviour = require("./behaviour/css").CssBehaviour;
var CStyleFoldMode = require("./folding/cstyle").FoldMode;
var CssCompletions = require("./css_completions").CssCompletions;

var Mode = function() {
    var highlighter = new CssHighlightRules();
    this.$tokenizer = new Tokenizer(highlighter.getRules());
    this.$outdent = new MatchingBraceOutdent();
    this.$behaviour = new CssBehaviour();
    this.$completer = new CssCompletions();
    this.foldingRules = new CStyleFoldMode();
};
oop.inherits(Mode, TextMode);

(function() {

    this.foldingRules = "cStyle";
    this.blockComment = {start: "/*", end: "*/"};

    this.getNextLineIndent = function(state, line, tab) {
        var indent = this.$getIndent(line);
        var tokens = this.$tokenizer.getLineTokens(line, state).tokens;
        if (tokens.length && tokens[tokens.length-1].type == "comment") {
            return indent;
        }

        var match = line.match(/^.*\{\s*$/);
        if (match) {
            indent += tab;
        }

        return indent;
    };

    this.checkOutdent = function(state, line, input) {
        return this.$outdent.checkOutdent(line, input);
    };

    this.autoOutdent = function(state, doc, row) {
        this.$outdent.autoOutdent(doc, row);
    };

    this.createWorker = function(session) {
        var worker = new WorkerClient(["ace"], "ace/mode/css_worker", "Worker");
        worker.attachToDocument(session.getDocument());

        worker.on("csslint", function(e) {
            session.setAnnotations(e.data);
        });

        worker.on("terminate", function() {
            session.clearAnnotations();
        });

        return worker;
    };

    this.getCompletions = function(state, session, pos, prefix) {
        return this.$completer.getCompletions(state, session, pos, prefix);
    };

}).call(Mode.prototype);

exports.Mode = Mode;

});

ace.define('ace/mode/css_highlight_rules', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/lib/lang', 'ace/mode/text_highlight_rules'], function(require, exports, module) {


var oop = require("../lib/oop");
var lang = require("../lib/lang");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var CssHighlightRules = function() {

    this.$rules = {
        "start" : [
            {include: '#comment-block'},
            {include: '#ruleset'},
            {
               token: 'keyword.control.at-rule.font-face.css',
               regex: '@font-face\\b'
            },
            {
                token: 'keyword.control.at-rule.charset.css',
                regex: '@charset\\b',
                push: [
                    { include: '#string-double' },
                    { include: '#string-single' },
                    {
                        token: 'punctuation.terminator.at-rule.css',
                        regex: ';',
                        next: 'pop'
                    }
                ]
            },
            {
                token: 'keyword.control.at-rule.namespace.css',
                regex: '@namespace\\b',
                push: [
                    { include: '#string-double' },
                    { include: '#string-single' },
                    { include: '#url'},
                    {
                        token: 'constant.other.namespace.css',
                        regex: '\\-?[a-zA-Z_][a-zA-Z0-9_\\-]*'
                    },
                    {
                        token: 'punctuation.terminator.at-rule.css',
                        regex: ';',
                        next: 'pop'
                    }
                ]
            },
            {
                token: 'keyword.control.at-rule.import.css',
                regex: '@import\\b',
                push: [
                    { include: '#string-double' },
                    { include: '#string-single' },
                    { include: '#url'},
                      {
                        token: 'punctuation.terminator.at-rule.css',
                        regex: ';',
                        next: 'pop' },
                    { include: '#media-query-list'}
                ]
            },
            {
                token: 'keyword.control.at-rule.media.css',
                regex: '@media',
                push: [
                    {include: '#media-query-list'},
                    {
                        token: 'punctuation.section.property-list.css',
                        regex: '\\{',
                        push: [
                            {include: '#ruleset'},
                            {include: '#comment-block'},
                            {
                                token: 'punctuation.section.property-list.css',
                                regex: '\\}',
                                next: 'pop'
                            }
                        ]
                    },
                    {token: '', regex: '', next: 'pop'}
                ]
            },
            {
                token: 'keyword.control.at-rule.keyframes.css',
                regex: '@keyframes\\b',
                push: [
                    {
                        token: 'punctuation.section.property-list.css',
                        regex: '\\{',
                        next: [
                            {include: '#keyframes-selector'},
                            {include: '#rule-list'},
                            {
                                token: 'punctuation.section.property-list.css',
                                regex: '\\}',
                                next: 'pop'
                            }
                        ]
                    },
                    {
                        token: 'constant.other.keyframes.css',
                        regex: '\\-?[a-zA-Z_][a-zA-Z0-9_\\-]*'
                    }
                ]
            },
        ],
        '#media-query-list': [
            {include: '#whitespace'},
            {
                token: 'keyword.operator.logic.media.css',
                regex: 'only|not'
            },
            {
                token: 'support.constant.media.css',
                regex: 'all|aural|braille|embossed|handheld|print|projection|screen|tty|tv'
            },
            {
                token: 'punctuation.definition.arbitrary-repitition.css',
                regex: ','
            }
        ],
        '#ruleset': [
            {include: '#whitespace'},
            {include: '#selector'},
            {include: '#rule-list'},
        ],
        '#declaration': [
             { include: '#comment-block' },
                { TODO: 'FIXME: regexp doesn\'t have js equivalent',
                originalRegex: '(?<![-a-z])(?=[-a-z])',
                    token: 'meta.property-name.css',
                    regex: '(?=[-a-z])',
                    push: [
                        {
                            token: 'support.type.property-name.css',
                            regex: "\\-?[a-zA-Z_][a-zA-Z0-9_\\-]*"
                        }, {
                            token: 'meta.property-name.css',
                            regex: '$|(?![-a-z])',
                            next: 'pop'
                        }
                    ]
                }, {
                    token: 'punctuation.separator.key-value.css',
                    regex: ':',
                    push: [
                        { include: '#property-values' },
                        {
                            token: 'punctuation.terminator.rule.css',
                            regex: ';|(?=\\})',
                            next: 'pop'
                        }
                    ]
                },
        ],
        '#rule-list': [
            {
                token: 'punctuation.section.property-list.css',
                regex: '\\{',
                push: [
                    {include: '#declaration'},
                    {
                        token: 'punctuation.section.property-list.css',
                        regex: '\\}',
                        next: 'pop'
                    }
                ],
            }
        ],
        '#keyframes-selector': [
            {
               token: ['constant.numeric.css', 'keyword.other.unit.css'],
               regex: '((?:(?:[0-9]+(?:\\.[0-9]+)?)|(?:\\.[0-9]+)))(%)?'
            }
        ],
        '#selector': [
            {
                token: 'meta.selector.css',
                regex: '(?=[:.*#a-zA-Z])',
                push: [
                    {
                        caseInsensitive: true,
                        token: 'entity.name.tag.css',
                        regex: '\\b(?:a|abbr|acronym|address|area|article|aside|audio|b|base|big|blockquote|body|br|button|canvas|caption|cite|code|col|colgroup|datalist|dd|del|details|dfn|dialog|div|dl|dt|em|eventsource|fieldset|figure|figcaption|footer|form|frame|frameset|(h[1-6])|head|header|hgroup|hr|html|i|iframe|img|input|ins|kbd|label|legend|li|link|map|mark|menu|meta|meter|nav|noframes|noscript|object|ol|optgroup|option|output|p|param|pre|progress|q|samp|script|section|select|small|span|strike|strong|style|sub|summary|sup|table|tbody|td|textarea|tfoot|th|thead|time|title|tr|tt|ul|var|video)\\b'
                    },
                    {
                        token: 'entity.other.attribute-name.class.css',
                        regex: '\\.[a-zA-Z0-9_-]+'
                    },
                    {
                        token: 'entity.other.attribute-name.id.css',
                        regex: '#[a-zA-Z][a-zA-Z0-9_-]*'
                    },
                    {
                        caseInsensitive: true,
                        token: 'entity.other.attribute-name.pseudo-element.css',
                        regex: ':{1,2}(?:after|before|first-letter|first-line|selection)\\b'
                    },
                    {
                        caseInsensitive: true,
                        token: 'entity.other.attribute-name.pseudo-class.css',
                        regex: ':(?:(?:first|last)-child|(?:first|last|only)-of-type|empty|root|target|first|left|right)\\b'
                    },
                    {
                        caseInsensitive: true,
                        token: 'entity.other.attribute-name.pseudo-class.ui-state.css',
                        regex: ':(?:checked|enabled|default|disabled|indeterminate|invalid|optional|required|valid)\\b'
                    },
                    {
                        token: ['entity.other.attribute-name.pseudo-class.css', 'punctuation.section.function.css'],
                        regex: '(:not)(\\()',
                        push: [
                            {include: '#selector'},
                            {
                                token: 'punctuation.section.function.css',
                                regex: '\\)',
                                next: 'pop'
                            }
                        ]
                    },
                    {
                        token: ['entity.other.attribute-name.pseudo-class.css', 'punctuation.section.function.css'],
                        regex: '(:nth-(?:(?:last-)?child|(?:last-)?of-type))(\\()',
                        push: [
                            {
                                token: 'punctuation.section.function.css',
                                regex: '\\)',
                                next: 'pop'
                            },
                            {
                                token: 'constant.numeric.css',
                                regex: '\\-?(?:\\d+n?|n)(?:\\+\\d+)?|even|odd'
                            }
                        ]
                    },
                    {
                        token: 'entity.other.attribute-name.pseudo-class.css',
                        regex: ':(?:active|hover|link|visited|focus)\\b'
                    },
                    {
                        caseInsensitive: true,
                        todo: 'fix grouping',
                        TODO: 'FIXME: regexp doesn\'t have js equivalent',
                        originalRegex: '(?i)(\\[)\\s*(-?[_a-z\\\\[[:^ascii:]]][_a-z0-9\\-\\\\[[:^ascii:]]]*)(?:\\s*([~|^$*]?=)\\s*(?:(-?[_a-z\\\\[[:^ascii:]]][_a-z0-9\\-\\\\[[:^ascii:]]]*)|((?>([\'"])(?:[^\\\\]|\\\\.)*?(\\6)))))?\\s*(\\])'.replace(/\[:\^ascii:\]/g, 'а-я'),
                        token: [ 'meta.attribute-selector.css'/*,
                           'punctuation.definition.entity.css',
                           'entity.other.attribute-name.attribute.css',
                           'punctuation.separator.operator.css',
                           'string.unquoted.attribute-value.css',
                           'string.quoted.double.attribute-value.css',
                           'punctuation.definition.string.begin.css',
                           'punctuation.definition.string.end.css'*/ ],
                        regex: '#?[a-z]+'
                    },
                    {
                        token: 'meta.selector.css',
                        regex: '(?=[/@{)])',
                        next: 'pop'
                    },
                    {defaultToken: 'text.css'}
                ]
            }
        ],
        '#numeric-values': [
            {
                token: 'constant.other.color.rgb-value.css',
                regex: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b'
            },
            {
                caseInsensitive: true,
                token: [ 'constant.numeric.css', 'keyword.other.unit.css' ],
                regex: '((?:-|\\+)?(?:(?:[0-9]+(?:\\.[0-9]+)?)|(?:\\.[0-9]+)))((?:px|pt|ch|cm|mm|in|r?em|ex|pc|deg|g?rad|dpi|dpcm|s)\\b|%)?'
            }
        ],
        '#property-values': [
            {
                caseInsensitive: true,
                token: 'support.constant.property-value.css',
                regex: '\\b(?:absolute|after-edge|after|all-scroll|all|alphabetic|always|antialiased|armenian|auto|avoid-column|avoid-page|avoid|balance|baseline|before-edge|before|below|bidi-override|block-line-height|block|bold|bolder|border-box|both|bottom|box|break-all|break-word|capitalize|caps-height|caption|center|central|char|circle|cjk-ideographic|clone|close-quote|col-resize|collapse|column|consider-shifts|contain|content-box|cover|crosshair|cubic-bezier|dashed|decimal-leading-zero|decimal|default|disabled|disc|disregard-shifts|distribute-all-lines|distribute-letter|distribute-space|distribute|dotted|double|e-resize|ease-in|ease-in-out|ease-out|ease|ellipsis|end|exclude-ruby|fill|fixed|georgian|glyphs|grid-height|groove|hand|hanging|hebrew|help|hidden|hiragana-iroha|hiragana|horizontal|icon|ideograph-alpha|ideograph-numeric|ideograph-parenthesis|ideograph-space|ideographic|inactive|include-ruby|inherit|initial|inline-block|inline-box|inline-line-height|inline-table|inline|inset|inside|inter-ideograph|inter-word|invert|italic|justify|katakana-iroha|katakana|keep-all|last|left|lighter|line-edge|line-through|line|linear|list-item|local|loose|lower-alpha|lower-greek|lower-latin|lower-roman|lowercase|lr-tb|ltr|mathematical|max-height|max-size|medium|menu|message-box|middle|move|n-resize|ne-resize|newspaper|no-change|no-close-quote|no-drop|no-open-quote|no-repeat|none|normal|not-allowed|nowrap|nw-resize|oblique|open-quote|outset|outside|overline|padding-box|page|pointer|pre-line|pre-wrap|pre|preserve-3d|progress|relative|repeat-x|repeat-y|repeat|replaced|reset-size|ridge|right|round|row-resize|rtl|s-resize|scroll|se-resize|separate|slice|small-caps|small-caption|solid|space|square|start|static|status-bar|step-end|step-start|steps|stretch|strict|sub|super|sw-resize|table-caption|table-cell|table-column-group|table-column|table-footer-group|table-header-group|table-row-group|table-row|table|tb-rl|text-after-edge|text-before-edge|text-bottom|text-size|text-top|text|thick|thin|top|transparent|underline|upper-alpha|upper-latin|upper-roman|uppercase|use-script|vertical-ideographic|vertical-text|visible|w-resize|wait|whitespace|z-index|zero)\\b'
            },
            {
                caseInsensitive: true,
                token: 'support.constant.font-name.css',
                regex: '(\\b(?:arial|century|comic|courier|garamond|georgia|helvetica|impact|lucida|symbol|system|tahoma|times|trebuchet|utopia|verdana|webdings|sans-serif|serif|monospace)\\b)'
            },
            {include: '#numeric-values'},
            {include: '#color-values'},
            {include: '#string-double'},
            {include: '#string-single'},
            {
                token: ['support.function.misc.css', 'punctuation.section.function.css'],
                regex: '(rect)\\s*(\\()',
                push: [
                    {include: '#numeric-values'},
                    {
                        token: 'punctuation.section.function.css',
                        regex: '\\)',
                        next: 'pop'
                    }
                ]
            },
            {include : '#url'},
            {
                token: [ 'support.function.misc.css', 'punctuation.section.function.css'],
                regex: '([-a-z]+)\\s*(\\()',
                push: [
                    {include: '#string-single'},
                    {include: '#string-double'},
                    {
                        token: 'variable.parameter.misc.css',
                        regex: '[^\'") \\t]+'
                    },
                    {
                        token: 'punctuation.section.function.css' ,
                        regex: '\\)',
                        next: 'pop'
                    }
                ]
            },
            {
                token: 'keyword.other.important.css',
                regex: '\\!\\s*important'
            }
        ],
        '#comment-block': [
            {
                token: 'punctuation.definition.comment.css',
                regex: '/\\*',
                push: [
                    {
                        token: 'punctuation.definition.comment.css',
                        regex: '\\*/',
                        next: 'pop'
                    },
                    {defaultToken: 'comment.block.css'}
                ]
            }
        ],
       '#color-values': [
            {
                token: 'support.constant.color.w3c-standard-color-name.css',
                regex: '\\b(aqua|black|blue|fuchsia|gray|green|lime|maroon|navy|olive|orange|purple|red|silver|teal|white|yellow)\\b',
            },
            {
                token: 'invalid.deprecated.color.w3c-non-standard-color-name.css',
                regex: '\\b(aliceblue|antiquewhite|aquamarine|azure|beige|bisque|blanchedalmond|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|gainsboro|ghostwhite|gold|goldenrod|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|limegreen|linen|magenta|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|oldlace|olivedrab|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|thistle|tomato|turquoise|violet|wheat|whitesmoke|yellowgreen)\\b',
            },
            {
                token: ['support.function.misc.css', 'punctuation.section.function.css'],
                regex: '(hsla?|rgba?)\\s*(\\()',
                push: [
                    {
                        token: 'constant.other.color.rgb-value.css',
                        regex: '\\b(0*((1?[0-9]{1,2})|(2([0-4][0-9]|5[0-5])))\\s*,\\s*){2}(0*((1?[0-9]{1,2})|(2([0-4][0-9]|5[0-5])))\\b)(\\s*,\\s*((0?\\.[0-9]+)|[0-1]))?'
                    },
                    {
                        token: 'constant.other.color.rgb-percentage.css',
                        regex: '\\b([0-9]{1,2}|100)\\s*%,\\s*([0-9]{1,2}|100)\\s*%,\\s*([0-9]{1,2}|100)\\s*%'
                    },
                    {include: '#numeric-values'},
                    {
                        token: 'punctuation.section.function.css',
                        regex: '\\)',
                        next: 'pop'
                    }
                ]
            }
        ],
        '#string-double': [
            {
                token: 'punctuation.definition.string.begin.css',
                regex: '"',
                push: [
                    {
                        token: 'constant.character.escape.css',
                        regex: '\\\\.'
                    },
                    {
                        token: 'punctuation.definition.string.end.css',
                        regex: '"',
                        next: 'pop'
                    },
                    {defaultToken: 'string.quoted.double.css'}
                ]
            }
        ],
       '#string-single': [
            {
                token: 'punctuation.definition.string.begin.css',
                regex: '\'',
                push: [
                    {
                        token: 'constant.character.escape.css',
                        regex: '\\\\.'
                    },
                    {
                        token: 'punctuation.definition.string.end.css',
                        regex: '\'',
                        next: 'pop'
                    },
                    {defaultToken: 'string.quoted.single.css' }
                ]
            }
        ],
        '#whitespace': [
            {token: 'text.css', regex: '\\s+'}
        ],
        '#url': [
            {
                token: ['support.function.url.css', 'punctuation.section.function.css'],
                regex: '(url)\\s*(\\()',
                push: [
                    {
                        token: 'variable.parameter.url.css',
                        regex: '[^\'") \\t]+'
                    },
                    {include: '#string-single'},
                    {include: '#string-double'},
                    {
                        token: 'punctuation.section.function.css',
                        regex: '\\)',
                        next: 'pop'
                    }
                ]
            }
        ]
    };

    this.normalizeRules();
};

oop.inherits(CssHighlightRules, TextHighlightRules);

exports.CssHighlightRules = CssHighlightRules;

});

ace.define('ace/mode/matching_brace_outdent', ['require', 'exports', 'module' , 'ace/range'], function(require, exports, module) {


var Range = require("../range").Range;

var MatchingBraceOutdent = function() {};

(function() {

    this.checkOutdent = function(line, input) {
        if (! /^\s+$/.test(line))
            return false;

        return /^\s*\}/.test(input);
    };

    this.autoOutdent = function(doc, row) {
        var line = doc.getLine(row);
        var match = line.match(/^(\s*\})/);

        if (!match) return 0;

        var column = match[1].length;
        var openBracePos = doc.findMatchingBracket({row: row, column: column});

        if (!openBracePos || openBracePos.row == row) return 0;

        var indent = this.$getIndent(doc.getLine(openBracePos.row));
        doc.replace(new Range(row, 0, row, column-1), indent);
    };

    this.$getIndent = function(line) {
        return line.match(/^\s*/)[0];
    };

}).call(MatchingBraceOutdent.prototype);

exports.MatchingBraceOutdent = MatchingBraceOutdent;
});

ace.define('ace/mode/behaviour/css', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/behaviour', 'ace/mode/behaviour/cstyle', 'ace/token_iterator'], function(require, exports, module) {


var oop = require("../../lib/oop");
var Behaviour = require("../behaviour").Behaviour;
var CstyleBehaviour = require("./cstyle").CstyleBehaviour;
var TokenIterator = require("../../token_iterator").TokenIterator;

var CssBehaviour = function () {

    this.inherit(CstyleBehaviour);

    this.add("colon", "insertion", function (state, action, editor, session, text) {
        if (text === ':') {
            var cursor = editor.getCursorPosition();
            var iterator = new TokenIterator(session, cursor.row, cursor.column);
            var token = iterator.getCurrentToken();
            if (token && token.value.match(/\s+/)) {
                token = iterator.stepBackward();
            }
            if (token && token.type === 'support.type') {
                var line = session.doc.getLine(cursor.row);
                var rightChar = line.substring(cursor.column, cursor.column + 1);
                if (rightChar === ':') {
                    return {
                       text: '',
                       selection: [1, 1]
                    }
                }
                if (!line.substring(cursor.column).match(/^\s*;/)) {
                    return {
                       text: ':;',
                       selection: [1, 1]
                    }
                }
            }
        }
    });

    this.add("colon", "deletion", function (state, action, editor, session, range) {
        var selected = session.doc.getTextRange(range);
        if (!range.isMultiLine() && selected === ':') {
            var cursor = editor.getCursorPosition();
            var iterator = new TokenIterator(session, cursor.row, cursor.column);
            var token = iterator.getCurrentToken();
            if (token && token.value.match(/\s+/)) {
                token = iterator.stepBackward();
            }
            if (token && token.type === 'support.type') {
                var line = session.doc.getLine(range.start.row);
                var rightChar = line.substring(range.end.column, range.end.column + 1);
                if (rightChar === ';') {
                    range.end.column ++;
                    return range;
                }
            }
        }
    });

    this.add("semicolon", "insertion", function (state, action, editor, session, text) {
        if (text === ';') {
            var cursor = editor.getCursorPosition();
            var line = session.doc.getLine(cursor.row);
            var rightChar = line.substring(cursor.column, cursor.column + 1);
            if (rightChar === ';') {
                return {
                   text: '',
                   selection: [1, 1]
                }
            }
        }
    });

}
oop.inherits(CssBehaviour, CstyleBehaviour);

exports.CssBehaviour = CssBehaviour;
});

ace.define('ace/mode/behaviour/cstyle', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/behaviour', 'ace/token_iterator', 'ace/lib/lang'], function(require, exports, module) {


var oop = require("../../lib/oop");
var Behaviour = require("../behaviour").Behaviour;
var TokenIterator = require("../../token_iterator").TokenIterator;
var lang = require("../../lib/lang");

var SAFE_INSERT_IN_TOKENS =
    ["text", "paren.rparen", "punctuation.operator"];
var SAFE_INSERT_BEFORE_TOKENS =
    ["text", "paren.rparen", "punctuation.operator", "comment"];


var autoInsertedBrackets = 0;
var autoInsertedRow = -1;
var autoInsertedLineEnd = "";
var maybeInsertedBrackets = 0;
var maybeInsertedRow = -1;
var maybeInsertedLineStart = "";
var maybeInsertedLineEnd = "";

var CstyleBehaviour = function () {
    
    CstyleBehaviour.isSaneInsertion = function(editor, session) {
        var cursor = editor.getCursorPosition();
        var iterator = new TokenIterator(session, cursor.row, cursor.column);
        if (!this.$matchTokenType(iterator.getCurrentToken() || "text", SAFE_INSERT_IN_TOKENS)) {
            var iterator2 = new TokenIterator(session, cursor.row, cursor.column + 1);
            if (!this.$matchTokenType(iterator2.getCurrentToken() || "text", SAFE_INSERT_IN_TOKENS))
                return false;
        }
        iterator.stepForward();
        return iterator.getCurrentTokenRow() !== cursor.row ||
            this.$matchTokenType(iterator.getCurrentToken() || "text", SAFE_INSERT_BEFORE_TOKENS);
    };
    
    CstyleBehaviour.$matchTokenType = function(token, types) {
        return types.indexOf(token.type || token) > -1;
    };
    
    CstyleBehaviour.recordAutoInsert = function(editor, session, bracket) {
        var cursor = editor.getCursorPosition();
        var line = session.doc.getLine(cursor.row);
        if (!this.isAutoInsertedClosing(cursor, line, autoInsertedLineEnd[0]))
            autoInsertedBrackets = 0;
        autoInsertedRow = cursor.row;
        autoInsertedLineEnd = bracket + line.substr(cursor.column);
        autoInsertedBrackets++;
    };
    
    CstyleBehaviour.recordMaybeInsert = function(editor, session, bracket) {
        var cursor = editor.getCursorPosition();
        var line = session.doc.getLine(cursor.row);
        if (!this.isMaybeInsertedClosing(cursor, line))
            maybeInsertedBrackets = 0;
        maybeInsertedRow = cursor.row;
        maybeInsertedLineStart = line.substr(0, cursor.column) + bracket;
        maybeInsertedLineEnd = line.substr(cursor.column);
        maybeInsertedBrackets++;
    };
    
    CstyleBehaviour.isAutoInsertedClosing = function(cursor, line, bracket) {
        return autoInsertedBrackets > 0 &&
            cursor.row === autoInsertedRow &&
            bracket === autoInsertedLineEnd[0] &&
            line.substr(cursor.column) === autoInsertedLineEnd;
    };
    
    CstyleBehaviour.isMaybeInsertedClosing = function(cursor, line) {
        return maybeInsertedBrackets > 0 &&
            cursor.row === maybeInsertedRow &&
            line.substr(cursor.column) === maybeInsertedLineEnd &&
            line.substr(0, cursor.column) == maybeInsertedLineStart;
    };
    
    CstyleBehaviour.popAutoInsertedClosing = function() {
        autoInsertedLineEnd = autoInsertedLineEnd.substr(1);
        autoInsertedBrackets--;
    };
    
    CstyleBehaviour.clearMaybeInsertedClosing = function() {
        maybeInsertedBrackets = 0;
        maybeInsertedRow = -1;
    };

    this.add("braces", "insertion", function (state, action, editor, session, text) {
        var cursor = editor.getCursorPosition();
        var line = session.doc.getLine(cursor.row);
        if (text == '{') {
            var selection = editor.getSelectionRange();
            var selected = session.doc.getTextRange(selection);
            if (selected !== "" && selected !== "{" && editor.getWrapBehavioursEnabled()) {
                return {
                    text: '{' + selected + '}',
                    selection: false
                };
            } else if (CstyleBehaviour.isSaneInsertion(editor, session)) {
                if (/[\]\}\)]/.test(line[cursor.column])) {
                    CstyleBehaviour.recordAutoInsert(editor, session, "}");
                    return {
                        text: '{}',
                        selection: [1, 1]
                    };
                } else {
                    CstyleBehaviour.recordMaybeInsert(editor, session, "{");
                    return {
                        text: '{',
                        selection: [1, 1]
                    };
                }
            }
        } else if (text == '}') {
            var rightChar = line.substring(cursor.column, cursor.column + 1);
            if (rightChar == '}') {
                var matching = session.$findOpeningBracket('}', {column: cursor.column + 1, row: cursor.row});
                if (matching !== null && CstyleBehaviour.isAutoInsertedClosing(cursor, line, text)) {
                    CstyleBehaviour.popAutoInsertedClosing();
                    return {
                        text: '',
                        selection: [1, 1]
                    };
                }
            }
        } else if (text == "\n" || text == "\r\n") {
            var closing = "";
            if (CstyleBehaviour.isMaybeInsertedClosing(cursor, line)) {
                closing = lang.stringRepeat("}", maybeInsertedBrackets);
                CstyleBehaviour.clearMaybeInsertedClosing();
            }
            var rightChar = line.substring(cursor.column, cursor.column + 1);
            if (rightChar == '}' || closing !== "") {
                var openBracePos = session.findMatchingBracket({row: cursor.row, column: cursor.column}, '}');
                if (!openBracePos)
                     return null;

                var indent = this.getNextLineIndent(state, line.substring(0, cursor.column), session.getTabString());
                var next_indent = this.$getIndent(line);

                return {
                    text: '\n' + indent + '\n' + next_indent + closing,
                    selection: [1, indent.length, 1, indent.length]
                };
            }
        }
    });

    this.add("braces", "deletion", function (state, action, editor, session, range) {
        var selected = session.doc.getTextRange(range);
        if (!range.isMultiLine() && selected == '{') {
            var line = session.doc.getLine(range.start.row);
            var rightChar = line.substring(range.end.column, range.end.column + 1);
            if (rightChar == '}') {
                range.end.column++;
                return range;
            } else {
                maybeInsertedBrackets--;
            }
        }
    });

    this.add("parens", "insertion", function (state, action, editor, session, text) {
        if (text == '(') {
            var selection = editor.getSelectionRange();
            var selected = session.doc.getTextRange(selection);
            if (selected !== "" && editor.getWrapBehavioursEnabled()) {
                return {
                    text: '(' + selected + ')',
                    selection: false
                };
            } else if (CstyleBehaviour.isSaneInsertion(editor, session)) {
                CstyleBehaviour.recordAutoInsert(editor, session, ")");
                return {
                    text: '()',
                    selection: [1, 1]
                };
            }
        } else if (text == ')') {
            var cursor = editor.getCursorPosition();
            var line = session.doc.getLine(cursor.row);
            var rightChar = line.substring(cursor.column, cursor.column + 1);
            if (rightChar == ')') {
                var matching = session.$findOpeningBracket(')', {column: cursor.column + 1, row: cursor.row});
                if (matching !== null && CstyleBehaviour.isAutoInsertedClosing(cursor, line, text)) {
                    CstyleBehaviour.popAutoInsertedClosing();
                    return {
                        text: '',
                        selection: [1, 1]
                    };
                }
            }
        }
    });

    this.add("parens", "deletion", function (state, action, editor, session, range) {
        var selected = session.doc.getTextRange(range);
        if (!range.isMultiLine() && selected == '(') {
            var line = session.doc.getLine(range.start.row);
            var rightChar = line.substring(range.start.column + 1, range.start.column + 2);
            if (rightChar == ')') {
                range.end.column++;
                return range;
            }
        }
    });

    this.add("brackets", "insertion", function (state, action, editor, session, text) {
        if (text == '[') {
            var selection = editor.getSelectionRange();
            var selected = session.doc.getTextRange(selection);
            if (selected !== "" && editor.getWrapBehavioursEnabled()) {
                return {
                    text: '[' + selected + ']',
                    selection: false
                };
            } else if (CstyleBehaviour.isSaneInsertion(editor, session)) {
                CstyleBehaviour.recordAutoInsert(editor, session, "]");
                return {
                    text: '[]',
                    selection: [1, 1]
                };
            }
        } else if (text == ']') {
            var cursor = editor.getCursorPosition();
            var line = session.doc.getLine(cursor.row);
            var rightChar = line.substring(cursor.column, cursor.column + 1);
            if (rightChar == ']') {
                var matching = session.$findOpeningBracket(']', {column: cursor.column + 1, row: cursor.row});
                if (matching !== null && CstyleBehaviour.isAutoInsertedClosing(cursor, line, text)) {
                    CstyleBehaviour.popAutoInsertedClosing();
                    return {
                        text: '',
                        selection: [1, 1]
                    };
                }
            }
        }
    });

    this.add("brackets", "deletion", function (state, action, editor, session, range) {
        var selected = session.doc.getTextRange(range);
        if (!range.isMultiLine() && selected == '[') {
            var line = session.doc.getLine(range.start.row);
            var rightChar = line.substring(range.start.column + 1, range.start.column + 2);
            if (rightChar == ']') {
                range.end.column++;
                return range;
            }
        }
    });

    this.add("string_dquotes", "insertion", function (state, action, editor, session, text) {
        if (text == '"' || text == "'") {
            var quote = text;
            var selection = editor.getSelectionRange();
            var selected = session.doc.getTextRange(selection);
            if (selected !== "" && selected !== "'" && selected != '"' && editor.getWrapBehavioursEnabled()) {
                return {
                    text: quote + selected + quote,
                    selection: false
                };
            } else {
                var cursor = editor.getCursorPosition();
                var line = session.doc.getLine(cursor.row);
                var leftChar = line.substring(cursor.column-1, cursor.column);
                if (leftChar == '\\') {
                    return null;
                }
                var tokens = session.getTokens(selection.start.row);
                var col = 0, token;
                var quotepos = -1; // Track whether we're inside an open quote.

                for (var x = 0; x < tokens.length; x++) {
                    token = tokens[x];
                    if (token.type == "string") {
                      quotepos = -1;
                    } else if (quotepos < 0) {
                      quotepos = token.value.indexOf(quote);
                    }
                    if ((token.value.length + col) > selection.start.column) {
                        break;
                    }
                    col += tokens[x].value.length;
                }
                if (!token || (quotepos < 0 && token.type !== "comment" && (token.type !== "string" || ((selection.start.column !== token.value.length+col-1) && token.value.lastIndexOf(quote) === token.value.length-1)))) {
                    if (!CstyleBehaviour.isSaneInsertion(editor, session))
                        return;
                    return {
                        text: quote + quote,
                        selection: [1,1]
                    };
                } else if (token && token.type === "string") {
                    var rightChar = line.substring(cursor.column, cursor.column + 1);
                    if (rightChar == quote) {
                        return {
                            text: '',
                            selection: [1, 1]
                        };
                    }
                }
            }
        }
    });

    this.add("string_dquotes", "deletion", function (state, action, editor, session, range) {
        var selected = session.doc.getTextRange(range);
        if (!range.isMultiLine() && (selected == '"' || selected == "'")) {
            var line = session.doc.getLine(range.start.row);
            var rightChar = line.substring(range.start.column + 1, range.start.column + 2);
            if (rightChar == selected) {
                range.end.column++;
                return range;
            }
        }
    });

};

oop.inherits(CstyleBehaviour, Behaviour);

exports.CstyleBehaviour = CstyleBehaviour;
});

ace.define('ace/mode/folding/cstyle', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/range', 'ace/mode/folding/fold_mode'], function(require, exports, module) {


var oop = require("../../lib/oop");
var Range = require("../../range").Range;
var BaseFoldMode = require("./fold_mode").FoldMode;

var FoldMode = exports.FoldMode = function(commentRegex) {
    if (commentRegex) {
        this.foldingStartMarker = new RegExp(
            this.foldingStartMarker.source.replace(/\|[^|]*?$/, "|" + commentRegex.start)
        );
        this.foldingStopMarker = new RegExp(
            this.foldingStopMarker.source.replace(/\|[^|]*?$/, "|" + commentRegex.end)
        );
    }
};
oop.inherits(FoldMode, BaseFoldMode);

(function() {

    this.foldingStartMarker = /(\{|\[)[^\}\]]*$|^\s*(\/\*)/;
    this.foldingStopMarker = /^[^\[\{]*(\}|\])|^[\s\*]*(\*\/)/;

    this.getFoldWidgetRange = function(session, foldStyle, row) {
        var line = session.getLine(row);
        var match = line.match(this.foldingStartMarker);
        if (match) {
            var i = match.index;

            if (match[1])
                return this.openingBracketBlock(session, match[1], row, i);

            return session.getCommentFoldRange(row, i + match[0].length, 1);
        }

        if (foldStyle !== "markbeginend")
            return;

        var match = line.match(this.foldingStopMarker);
        if (match) {
            var i = match.index + match[0].length;

            if (match[1])
                return this.closingBracketBlock(session, match[1], row, i);

            return session.getCommentFoldRange(row, i, -1);
        }
    };

}).call(FoldMode.prototype);

});

ace.define('ace/mode/css_completions', ['require', 'exports', 'module' , 'ace/token_iterator'], function(require, exports, module) {


var TokenIterator = require("../token_iterator").TokenIterator;

var common = {  "color": ["rgb($1)", "rgba($1)", "hsl($1)", "hsla($1)", "transparent"],
            "uri": ["url($1)"],
            "border-style": ["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"],
            "border-width": ["thin", "medium", "thick"],
            "shape": ["rect($1)"],
            "generic-family": ["serif", "sans-serif", "cursive", "fantasy", "monospace"] };

var css_data = '\
"background-attachment"=scroll | fixed | inherit\n\
"background-color"=<color> | inherit\n\
"background-image"=<uri> | none | inherit\n\
"background-position"=left | center | right | top | bottom | inherit\n\
"background-repeat"=repeat | repeat-x | repeat-y | no-repeat | inherit\n\
"background"=<color> | <uri> | repeat | repeat-x | repeat-y | no-repeat | scroll | fixed | left | center | right | top | bottom | inherit\n\
"border-collapse"=collapse | separate | inherit\n\
"border-color"=<color> | inherit\n\
"border-spacing"=inherit\n\
"border-style"=<border-style> | inherit\n\
"border-top" "border-right" "border-bottom" "border-left"=<border-width> | <border-style> | <color> | inherit\n\
"border-top-color" "border-right-color" "border-bottom-color" "border-left-color"=<color> | inherit\n\
"border-top-style" "border-right-style" "border-bottom-style" "border-left-style"=<border-style> | inherit\n\
"border-top-width" "border-right-width" "border-bottom-width" "border-left-width"=<border-width> | inherit\n\
"border-width"=<border-width> | inherit\n\
"border"= <border-width> | <border-style> | <color> | inherit\n\
"bottom"=<length> | <percentage> | auto | inherit\n\
"caption-side"=top | bottom | inherit\n\
"clear"=none | left | right | both | inherit\n\
"clip"=<shape> | auto | inherit\n\
"color"=<color> | inherit\n\
"content"=normal | none | <uri> | open-quote | close-quote | no-open-quote | no-close-quote | inherit\n\
"counter-increment"=none | inherit\n\
"counter-reset"=none | inherit\n\
"cursor"=<uri> | auto | crosshair | default | pointer | move | e-resize | ne-resize | nw-resize | n-resize | se-resize | sw-resize | s-resize | w-resize | text | wait | help | progress | inherit\n\
"direction"=ltr | rtl | inherit\n\
"display"=inline | block | list-item | inline-block | table | inline-table | table-row-group | table-header-group | table-footer-group | table-row | table-column-group | table-column | table-cell | table-caption | none | inherit\n\
"empty-cells"=show | hide | inherit\n\
"float"=left | right | none | inherit\n\
"font-family"=<generic-family>| inherit\n\
"font-size"=inherit\n\
"font-style"=normal | italic | oblique | inherit\n\
"font-variant"=normal | small-caps | inherit\n\
"font-weight"=normal | bold | bolder | lighter | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | inherit\n\
"font"=normal | italic | oblique | normal | small-caps | normal | bold | bolder | lighter | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | normal | <generic-family> | caption | icon | menu | message-box | small-caption | status-bar | inherit\n\
"height"=<length> | <percentage> | auto | inherit\n\
"left"=<length> | <percentage> | auto | inherit\n\
"letter-spacing"=normal | <length> | inherit\n\
"line-height"=normal | <number> | <length> | <percentage> | inherit\n\
"list-style-image"=<uri> | none | inherit\n\
"list-style-position"=inside | outside | inherit\n\
"list-style-type"=disc | circle | square | decimal | decimal-leading-zero | lower-roman | upper-roman | lower-greek | lower-latin | upper-latin | armenian | georgian | lower-alpha | upper-alpha | none | inherit\n\
"list-style"=disc | circle | square | decimal | decimal-leading-zero | lower-roman | upper-roman | lower-greek | lower-latin | upper-latin | armenian | georgian | lower-alpha | upper-alpha | none | inside | outside | <uri> | inherit\n\
"margin-right" "margin-left"=<margin-width> | inherit\n\
"margin-top" "margin-bottom"=<margin-width> | inherit\n\
"margin"=<margin-width> | inherit\n\
"max-height"=<length> | <percentage> | none | inherit\n\
"max-width"=<length> | <percentage> | none | inherit\n\
"min-height"=<length> | <percentage> | inherit\n\
"min-width"=<length> | <percentage> | inherit\n\
"opacity"=<number> | inherit\n\
"orphans"=<integer> | inherit\n\
"outline-color"=<color> | invert | inherit\n\
"outline-style"=<border-style> | inherit\n\
"outline-width"=<border-width> | inherit\n\
"outline"=<color> | <border-style> | <border-width> | inherit\n\
"overflow"=visible | hidden | scroll | auto | inherit\n\
"padding-top" "padding-right" "padding-bottom" "padding-left"=<padding-width> | inherit\n\
"padding"=<padding-width> | inherit\n\
"page-break-after"=auto | always | avoid | left | right | inherit\n\
"page-break-before"=auto | always | avoid | left | right | inherit\n\
"page-break-inside"=avoid | auto | inherit\n\
"position"=static | relative | absolute | fixed | inherit\n\
"quotes"=none | inherit\n\
"right"=<length> | <percentage> | auto | inherit\n\
"table-layout"=auto | fixed | inherit\n\
"text-align"=left | right | center | justify | inherit\n\
"text-decoration"=none | underline | overline | line-through | blink | inherit | none\n\
"text-indent"=<length> | <percentage> | inherit\n\
"text-transform"=capitalize | uppercase | lowercase | none | inherit\n\
"top"=<length> | <percentage> | auto | inherit\n\
"unicode-bidi"=normal | embed | bidi-override | inherit\n\
"vertical-align"=baseline | sub | super | top | text-top | middle | bottom | text-bottom | <percentage> | <length> | inherit\n\
"visibility"=visible | hidden | collapse | inherit\n\
"white-space"=normal | pre | nowrap | pre-wrap | pre-line | inherit\n\
"widows"=<integer> | inherit\n\
"width"=<length> | <percentage> | auto | inherit\n\
"word-spacing"=normal | <length> | inherit\n\
"z-index"=auto | <integer> | inherit\n\
\n\
\n\
"background-clip"=<box>\n\
"background-origin"=<box>\n\
"background-size"=<bg-size>\n\
"border"=<border-width> | <border-style> | <color>\n\
"border-color"=<color>\n\
"border-image"=<border-image-source> | <border-image-slice> | <border-image-width> | <border-image-width> | <border-image-outset> | <border-image-repeat>\n\
"border-image-outset"=<length> | <number>\n\
"border-image-repeat"=stretch | repeat | round | space\n\
"border-image-slice"=<number> | <percentage>\n\
"border-image-source"=none | <image>\n\
"border-image-width"=<length> | <percentage> | <number> | auto\n\
"border-radius"=<length> | <percentage>\n\
"border-style"=<border-style>\n\
"border-top" "border-right" "border-bottom" "border-left"=<border-width> | <border-style> | <color>\n\
"border-top-color" "border-right-color" "border-bottom-color" "border-left-color"=<color>\n\
"border-top-left-radius" "border-top-right-radius" "border-bottom-right-radius" "border-bottom-left-radius"=<length> | <percentage>\n\
"border-top-style" "border-right-style" "border-bottom-style" "border-left-style"=<border-style>\n\
"border-top-width" "border-right-width" "border-bottom-width" "border-left-width"=<border-width>\n\
"border-width"=<border-width>\n\
"box-decoration-break"=slice | clone\n\
"box-shadow"=none | <shadow> | none\n\
';

function parse_css_data(data) {
    var props = {};
    var lines = data.split('\n');
    lines.forEach(function(l){
        if (!l)
            return;

        var parts = l.split('='),
            names = parts[0],
            values = parts[1];

        var allowed_values = [];
        values.split('|').forEach(function(v){
            v = v.trim();
            if (v.charAt(0) == '<' && v.charAt(v.length - 1) == '>') {
                var key = v.substring(1, v.length - 1);
                if (key in common)
                    allowed_values = allowed_values.concat(common[key]);
            } else
                allowed_values.push(v);
        });

        names.split(' ').forEach(function(e){
            if (e.charAt(0) == '"')
                props[e.substring(1, e.length - 1)] = allowed_values.sort();
            else
                return false;
        });

    });

    return props;
}

var props = null;

var CssCompletions = function() {

};

(function(){

    this.getCompletions = function(state, session, pos, prefix) {

            var iterator = new TokenIterator(session, pos.row, pos.column);
            var token = iterator.getCurrentToken();
            var line = session.doc.getLine(pos.row);
            props = props || parse_css_data(css_data);

            var atPropName = token && token.type === 'support.type.property-name.css';

            if (!atPropName){
                var delimiters = ['punctuation.terminator.rule.css', 'punctuation.section.property-list.css'];
                do { token = iterator.stepBackward() } while (token && token.type == 'text');
                atPropName = delimiters.indexOf(token.type) !== -1;
            }

            if (atPropName) {
                var addColon = !line.substring(pos.column).match(/^\s*\:/);
                var completions = [];
                for (var prop in props)
                    completions.push({
                        caption: prop,
                        value: addColon ? prop + ': ' : prop,
                        score: 100,
                        meta: 'property'
                    });
                if (prefix)
                    completions = completions.filter(function(item){
                        return (item.caption).indexOf(prefix) === 0;
                    });
                return completions;
            } else if (token.type === "punctuation.separator.key-value.css") {
                var match = line.substring(0, pos.column - prefix.length).match(/([a-zA-Z-]+):\s*$/);
                if (match && match[1] in props) {
                    var addSemiColon = !line.substring(pos.column).match(/^\s*\;/);
                    var values = props[match[1]];
                    if (prefix)
                        values = values.filter(function(item){
                            return item.indexOf(prefix) === 0;
                        });
                    return values.map(function(value){
                        return {
                            caption: value.replace('$1', ''),
                            snippet: addSemiColon ? value + ';' : value,
                            score: 100,
                            meta: 'value'
                        };
                    });
                }
            }
            return [];
    };

}).call(CssCompletions.prototype);


exports.CssCompletions = CssCompletions;

});
