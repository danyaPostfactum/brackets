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

ace.define('ace/mode/html', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/text', 'ace/mode/javascript', 'ace/mode/css', 'ace/tokenizer', 'ace/mode/html_highlight_rules', 'ace/worker/worker_client', 'ace/mode/behaviour/html', 'ace/mode/folding/html', 'ace/mode/html_completions'], function(require, exports, module) {


var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var JavaScriptMode = require("./javascript").Mode;
var CssMode = require("./css").Mode;
var Tokenizer = require("../tokenizer").Tokenizer;
var HtmlHighlightRules = require("./html_highlight_rules").HtmlHighlightRules;
var WorkerClient = require("../worker/worker_client").WorkerClient;
var HtmlBehaviour = require("./behaviour/html").HtmlBehaviour;
var HtmlFoldMode = require("./folding/html").FoldMode;
var HtmlCompletions = require("./html_completions").HtmlCompletions;

var Mode = function() {
    var highlighter = new HtmlHighlightRules();
    this.$tokenizer = new Tokenizer(highlighter.getRules());
    this.$behaviour = new HtmlBehaviour();
    this.$completer = new HtmlCompletions();
    
    this.$embeds = highlighter.getEmbeds();
    this.createModeDelegates({
        "js-": JavaScriptMode,
        "css-": CssMode
    });
    
    this.foldingRules = new HtmlFoldMode();
};
oop.inherits(Mode, TextMode);

(function() {

    this.blockComment = {start: "<!--", end: "-->"};

    this.getNextLineIndent = function(state, line, tab) {
        return this.$getIndent(line);
    };

    this.checkOutdent = function(state, line, input) {
        return false;
    };

    this.getCompletions = function(state, session, pos, prefix) {
        return this.$completer.getCompletions(state, session, pos, prefix);
    };

    this.createWorker = function(session) {
        var worker = new WorkerClient(["ace"], "ace/mode/html_worker", "Worker");
        worker.attachToDocument(session.getDocument());

        worker.on("error", function(e) {
            session.setAnnotations(e.data);
        });

        worker.on("terminate", function() {
            session.clearAnnotations();
        });

        return worker;
    };

}).call(Mode.prototype);

exports.Mode = Mode;
});

ace.define('ace/mode/javascript', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/text', 'ace/tokenizer', 'ace/mode/javascript_highlight_rules', 'ace/mode/matching_brace_outdent', 'ace/range', 'ace/worker/worker_client', 'ace/mode/behaviour/cstyle', 'ace/mode/folding/cstyle'], function(require, exports, module) {


var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var Tokenizer = require("../tokenizer").Tokenizer;
var JavaScriptHighlightRules = require("./javascript_highlight_rules").JavaScriptHighlightRules;
var MatchingBraceOutdent = require("./matching_brace_outdent").MatchingBraceOutdent;
var Range = require("../range").Range;
var WorkerClient = require("../worker/worker_client").WorkerClient;
var CstyleBehaviour = require("./behaviour/cstyle").CstyleBehaviour;
var CStyleFoldMode = require("./folding/cstyle").FoldMode;

var Mode = function() {
    var highlighter = new JavaScriptHighlightRules();
    
    this.$tokenizer = new Tokenizer(highlighter.getRules());
    this.$outdent = new MatchingBraceOutdent();
    this.$behaviour = new CstyleBehaviour();
    this.$keywordList = highlighter.$keywordList;
    this.foldingRules = new CStyleFoldMode();
};
oop.inherits(Mode, TextMode);

(function() {

    this.lineCommentStart = "//";
    this.blockComment = {start: "/*", end: "*/"};

    this.getNextLineIndent = function(state, line, tab) {
        var indent = this.$getIndent(line);

        var tokenizedLine = this.$tokenizer.getLineTokens(line, state);
        var tokens = tokenizedLine.tokens;
        var endState = tokenizedLine.state;

        if (tokens.length && tokens[tokens.length-1].type == "comment") {
            return indent;
        }

        if (state == "start" || state == "no_regex") {
            var match = line.match(/^.*(?:\bcase\b.*\:|[\{\(\[])\s*$/);
            if (match) {
                indent += tab;
            }
        } else if (state == "doc-start") {
            if (endState == "start" || endState == "no_regex") {
                return "";
            }
            var match = line.match(/^\s*(\/?)\*/);
            if (match) {
                if (match[1]) {
                    indent += " ";
                }
                indent += "* ";
            }
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
        var worker = new WorkerClient(["ace"], "ace/mode/javascript_worker", "JavaScriptWorker");
        worker.attachToDocument(session.getDocument());

        worker.on("jslint", function(results) {
            session.setAnnotations(results.data);
        });

        worker.on("terminate", function() {
            session.clearAnnotations();
        });

        return worker;
    };

}).call(Mode.prototype);

exports.Mode = Mode;
});

ace.define('ace/mode/javascript_highlight_rules', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/doc_comment_highlight_rules', 'ace/mode/text_highlight_rules'], function(require, exports, module) {


var oop = require("../lib/oop");
var DocCommentHighlightRules = require("./doc_comment_highlight_rules").DocCommentHighlightRules;
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var JavaScriptHighlightRules = function() {
    var keywordMapper = this.createKeywordMapper({
        "variable.language":
            "Array|Boolean|Date|Function|Iterator|Number|Object|RegExp|String|Proxy|"  + // Constructors
            "Namespace|QName|XML|XMLList|"                                             + // E4X
            "ArrayBuffer|Float32Array|Float64Array|Int16Array|Int32Array|Int8Array|"   +
            "Uint16Array|Uint32Array|Uint8Array|Uint8ClampedArray|"                    +
            "Error|EvalError|InternalError|RangeError|ReferenceError|StopIteration|"   + // Errors
            "SyntaxError|TypeError|URIError|"                                          +
            "decodeURI|decodeURIComponent|encodeURI|encodeURIComponent|eval|isFinite|" + // Non-constructor functions
            "isNaN|parseFloat|parseInt|"                                               +
            "JSON|Math|"                                                               + // Other
            "this|arguments|prototype|window|document"                                 , // Pseudo
        "keyword":
            "const|yield|import|get|set|" +
            "break|case|catch|continue|default|delete|do|else|finally|for|function|" +
            "if|in|instanceof|new|return|switch|throw|try|typeof|let|var|while|with|debugger|" +
            "__parent__|__count__|escape|unescape|with|__proto__|" +
            "class|enum|extends|super|export|implements|private|public|interface|package|protected|static",
        "storage.type":
            "const|let|var|function",
        "constant.language":
            "null|Infinity|NaN|undefined",
        "support.function":
            "alert",
        "constant.language.boolean": "true|false"
    }, "identifier");
    var kwBeforeRe = "case|do|else|finally|in|instanceof|return|throw|try|typeof|yield|void";
    var identifierRe = "[a-zA-Z\\$_\u00a1-\uffff][a-zA-Z\\d\\$_\u00a1-\uffff]*\\b";

    var escapedRe = "\\\\(?:x[0-9a-fA-F]{2}|" + // hex
        "u[0-9a-fA-F]{4}|" + // unicode
        "[0-2][0-7]{0,2}|" + // oct
        "3[0-6][0-7]?|" + // oct
        "37[0-7]?|" + // oct
        "[4-7][0-7]?|" + //oct
        ".)";

    this.$rules = {
        "no_regex" : [
            {
                token : "comment",
                regex : "\\/\\/",
                next : "line_comment"
            },
            DocCommentHighlightRules.getStartRule("doc-start"),
            {
                token : "comment", // multi line comment
                regex : /\/\*/,
                next : "comment"
            }, {
                token : "string",
                regex : "'(?=.)",
                next  : "qstring"
            }, {
                token : "string",
                regex : '"(?=.)',
                next  : "qqstring"
            }, {
                token : "constant.numeric", // hex
                regex : /0[xX][0-9a-fA-F]+\b/
            }, {
                token : "constant.numeric", // float
                regex : /[+-]?\d+(?:(?:\.\d*)?(?:[eE][+-]?\d+)?)?\b/
            }, {
                token : [
                    "storage.type", "punctuation.operator", "support.function",
                    "punctuation.operator", "entity.name.function", "text","keyword.operator"
                ],
                regex : "(" + identifierRe + ")(\\.)(prototype)(\\.)(" + identifierRe +")(\\s*)(=)",
                next: "function_arguments"
            }, {
                token : [
                    "storage.type", "punctuation.operator", "entity.name.function", "text",
                    "keyword.operator", "text", "storage.type", "text", "paren.lparen"
                ],
                regex : "(" + identifierRe + ")(\\.)(" + identifierRe +")(\\s*)(=)(\\s*)(function)(\\s*)(\\()",
                next: "function_arguments"
            }, {
                token : [
                    "entity.name.function", "text", "keyword.operator", "text", "storage.type",
                    "text", "paren.lparen"
                ],
                regex : "(" + identifierRe +")(\\s*)(=)(\\s*)(function)(\\s*)(\\()",
                next: "function_arguments"
            }, {
                token : [
                    "storage.type", "punctuation.operator", "entity.name.function", "text",
                    "keyword.operator", "text",
                    "storage.type", "text", "entity.name.function", "text", "paren.lparen"
                ],
                regex : "(" + identifierRe + ")(\\.)(" + identifierRe +")(\\s*)(=)(\\s*)(function)(\\s+)(\\w+)(\\s*)(\\()",
                next: "function_arguments"
            }, {
                token : [
                    "storage.type", "text", "entity.name.function", "text", "paren.lparen"
                ],
                regex : "(function)(\\s+)(" + identifierRe + ")(\\s*)(\\()",
                next: "function_arguments"
            }, {
                token : [
                    "entity.name.function", "text", "punctuation.operator",
                    "text", "storage.type", "text", "paren.lparen"
                ],
                regex : "(" + identifierRe + ")(\\s*)(:)(\\s*)(function)(\\s*)(\\()",
                next: "function_arguments"
            }, {
                token : [
                    "text", "text", "storage.type", "text", "paren.lparen"
                ],
                regex : "(:)(\\s*)(function)(\\s*)(\\()",
                next: "function_arguments"
            }, {
                token : "keyword",
                regex : "(?:" + kwBeforeRe + ")\\b",
                next : "start"
            }, {
                token : ["punctuation.operator", "support.function"],
                regex : /(\.)(s(?:h(?:ift|ow(?:Mod(?:elessDialog|alDialog)|Help))|croll(?:X|By(?:Pages|Lines)?|Y|To)?|t(?:op|rike)|i(?:n|zeToContent|debar|gnText)|ort|u(?:p|b(?:str(?:ing)?)?)|pli(?:ce|t)|e(?:nd|t(?:Re(?:sizable|questHeader)|M(?:i(?:nutes|lliseconds)|onth)|Seconds|Ho(?:tKeys|urs)|Year|Cursor|Time(?:out)?|Interval|ZOptions|Date|UTC(?:M(?:i(?:nutes|lliseconds)|onth)|Seconds|Hours|Date|FullYear)|FullYear|Active)|arch)|qrt|lice|avePreferences|mall)|h(?:ome|andleEvent)|navigate|c(?:har(?:CodeAt|At)|o(?:s|n(?:cat|textual|firm)|mpile)|eil|lear(?:Timeout|Interval)?|a(?:ptureEvents|ll)|reate(?:StyleSheet|Popup|EventObject))|t(?:o(?:GMTString|S(?:tring|ource)|U(?:TCString|pperCase)|Lo(?:caleString|werCase))|est|a(?:n|int(?:Enabled)?))|i(?:s(?:NaN|Finite)|ndexOf|talics)|d(?:isableExternalCapture|ump|etachEvent)|u(?:n(?:shift|taint|escape|watch)|pdateCommands)|j(?:oin|avaEnabled)|p(?:o(?:p|w)|ush|lugins.refresh|a(?:ddings|rse(?:Int|Float)?)|r(?:int|ompt|eference))|e(?:scape|nableExternalCapture|val|lementFromPoint|x(?:p|ec(?:Script|Command)?))|valueOf|UTC|queryCommand(?:State|Indeterm|Enabled|Value)|f(?:i(?:nd|le(?:ModifiedDate|Size|CreatedDate|UpdatedDate)|xed)|o(?:nt(?:size|color)|rward)|loor|romCharCode)|watch|l(?:ink|o(?:ad|g)|astIndexOf)|a(?:sin|nchor|cos|t(?:tachEvent|ob|an(?:2)?)|pply|lert|b(?:s|ort))|r(?:ou(?:nd|teEvents)|e(?:size(?:By|To)|calc|turnValue|place|verse|l(?:oad|ease(?:Capture|Events)))|andom)|g(?:o|et(?:ResponseHeader|M(?:i(?:nutes|lliseconds)|onth)|Se(?:conds|lection)|Hours|Year|Time(?:zoneOffset)?|Da(?:y|te)|UTC(?:M(?:i(?:nutes|lliseconds)|onth)|Seconds|Hours|Da(?:y|te)|FullYear)|FullYear|A(?:ttention|llResponseHeaders)))|m(?:in|ove(?:B(?:y|elow)|To(?:Absolute)?|Above)|ergeAttributes|a(?:tch|rgins|x))|b(?:toa|ig|o(?:ld|rderWidths)|link|ack))\b(?=\()/
            }, {
                token : ["punctuation.operator", "support.function.dom"],
                regex : /(\.)(s(?:ub(?:stringData|mit)|plitText|e(?:t(?:NamedItem|Attribute(?:Node)?)|lect))|has(?:ChildNodes|Feature)|namedItem|c(?:l(?:ick|o(?:se|neNode))|reate(?:C(?:omment|DATASection|aption)|T(?:Head|extNode|Foot)|DocumentFragment|ProcessingInstruction|E(?:ntityReference|lement)|Attribute))|tabIndex|i(?:nsert(?:Row|Before|Cell|Data)|tem)|open|delete(?:Row|C(?:ell|aption)|T(?:Head|Foot)|Data)|focus|write(?:ln)?|a(?:dd|ppend(?:Child|Data))|re(?:set|place(?:Child|Data)|move(?:NamedItem|Child|Attribute(?:Node)?)?)|get(?:NamedItem|Element(?:sBy(?:Name|TagName)|ById)|Attribute(?:Node)?)|blur)\b(?=\()/
            }, {
                token : ["punctuation.operator", "support.constant"],
                regex : /(\.)(s(?:ystemLanguage|cr(?:ipts|ollbars|een(?:X|Y|Top|Left))|t(?:yle(?:Sheets)?|atus(?:Text|bar)?)|ibling(?:Below|Above)|ource|uffixes|e(?:curity(?:Policy)?|l(?:ection|f)))|h(?:istory|ost(?:name)?|as(?:h|Focus))|y|X(?:MLDocument|SLDocument)|n(?:ext|ame(?:space(?:s|URI)|Prop))|M(?:IN_VALUE|AX_VALUE)|c(?:haracterSet|o(?:n(?:structor|trollers)|okieEnabled|lorDepth|mp(?:onents|lete))|urrent|puClass|l(?:i(?:p(?:boardData)?|entInformation)|osed|asses)|alle(?:e|r)|rypto)|t(?:o(?:olbar|p)|ext(?:Transform|Indent|Decoration|Align)|ags)|SQRT(?:1_2|2)|i(?:n(?:ner(?:Height|Width)|put)|ds|gnoreCase)|zIndex|o(?:scpu|n(?:readystatechange|Line)|uter(?:Height|Width)|p(?:sProfile|ener)|ffscreenBuffering)|NEGATIVE_INFINITY|d(?:i(?:splay|alog(?:Height|Top|Width|Left|Arguments)|rectories)|e(?:scription|fault(?:Status|Ch(?:ecked|arset)|View)))|u(?:ser(?:Profile|Language|Agent)|n(?:iqueID|defined)|pdateInterval)|_content|p(?:ixelDepth|ort|ersonalbar|kcs11|l(?:ugins|atform)|a(?:thname|dding(?:Right|Bottom|Top|Left)|rent(?:Window|Layer)?|ge(?:X(?:Offset)?|Y(?:Offset)?))|r(?:o(?:to(?:col|type)|duct(?:Sub)?|mpter)|e(?:vious|fix)))|e(?:n(?:coding|abledPlugin)|x(?:ternal|pando)|mbeds)|v(?:isibility|endor(?:Sub)?|Linkcolor)|URLUnencoded|P(?:I|OSITIVE_INFINITY)|f(?:ilename|o(?:nt(?:Size|Family|Weight)|rmName)|rame(?:s|Element)|gColor)|E|whiteSpace|l(?:i(?:stStyleType|n(?:eHeight|kColor))|o(?:ca(?:tion(?:bar)?|lName)|wsrc)|e(?:ngth|ft(?:Context)?)|a(?:st(?:M(?:odified|atch)|Index|Paren)|yer(?:s|X)|nguage))|a(?:pp(?:MinorVersion|Name|Co(?:deName|re)|Version)|vail(?:Height|Top|Width|Left)|ll|r(?:ity|guments)|Linkcolor|bove)|r(?:ight(?:Context)?|e(?:sponse(?:XML|Text)|adyState))|global|x|m(?:imeTypes|ultiline|enubar|argin(?:Right|Bottom|Top|Left))|L(?:N(?:10|2)|OG(?:10E|2E))|b(?:o(?:ttom|rder(?:Width|RightWidth|BottomWidth|Style|Color|TopWidth|LeftWidth))|ufferDepth|elow|ackground(?:Color|Image)))\b/
            }, {
                token : ["storage.type", "punctuation.operator", "support.function.firebug"],
                regex : /(console)(\.)(warn|info|log|error|time|timeEnd|assert)\b/
            }, {
                token : keywordMapper,
                regex : identifierRe
            }, {
                token : "keyword.operator",
                regex : /--|\+\+|[!$%&*+\-~]|===|==|=|!=|!==|<=|>=|<<=|>>=|>>>=|<>|<|>|!|&&|\|\||\?\:|\*=|%=|\+=|\-=|&=|\^=/,
                next  : "start"
            }, {
                token : "punctuation.operator",
                regex : /\?|\:|\,|\;|\./,
                next  : "start"
            }, {
                token : "paren.lparen",
                regex : /[\[({]/,
                next  : "start"
            }, {
                token : "paren.rparen",
                regex : /[\])}]/
            }, {
                token : "keyword.operator",
                regex : /\/=?/,
                next  : "start"
            }, {
                token: "comment",
                regex: /^#!.*$/
            }
        ],
        "start": [
            DocCommentHighlightRules.getStartRule("doc-start"),
            {
                token : "comment", // multi line comment
                regex : "\\/\\*",
                next : "comment_regex_allowed"
            }, {
                token : "comment",
                regex : "\\/\\/",
                next : "line_comment_regex_allowed"
            }, {
                token: "string.regexp",
                regex: "\\/",
                next: "regex"
            }, {
                token : "text",
                regex : "\\s+|^$",
                next : "start"
            }, {
                token: "empty",
                regex: "",
                next: "no_regex"
            }
        ],
        "regex": [
            {
                token: "regexp.keyword.operator",
                regex: "\\\\(?:u[\\da-fA-F]{4}|x[\\da-fA-F]{2}|.)"
            }, {
                token: "string.regexp",
                regex: "/\\w*",
                next: "no_regex"
            }, {
                token : "invalid",
                regex: /\{\d+\b,?\d*\}[+*]|[+*$^?][+*]|[$^][?]|\?{3,}/
            }, {
                token : "constant.language.escape",
                regex: /\(\?[:=!]|\)|\{\d+\b,?\d*\}|[+*]\?|[()$^+*?]/
            }, {
                token : "constant.language.delimiter",
                regex: /\|/
            }, {
                token: "constant.language.escape",
                regex: /\[\^?/,
                next: "regex_character_class"
            }, {
                token: "empty",
                regex: "$",
                next: "no_regex"
            }, {
                defaultToken: "string.regexp"
            }
        ],
        "regex_character_class": [
            {
                token: "regexp.keyword.operator",
                regex: "\\\\(?:u[\\da-fA-F]{4}|x[\\da-fA-F]{2}|.)"
            }, {
                token: "constant.language.escape",
                regex: "]",
                next: "regex"
            }, {
                token: "constant.language.escape",
                regex: "-"
            }, {
                token: "empty",
                regex: "$",
                next: "no_regex"
            }, {
                defaultToken: "string.regexp.charachterclass"
            }
        ],
        "function_arguments": [
            {
                token: "variable.parameter",
                regex: identifierRe
            }, {
                token: "punctuation.operator",
                regex: "[, ]+"
            }, {
                token: "punctuation.operator",
                regex: "$"
            }, {
                token: "empty",
                regex: "",
                next: "no_regex"
            }
        ],
        "comment_regex_allowed" : [
            {token : "comment", regex : "\\*\\/", next : "start"},
            {defaultToken : "comment"}
        ],
        "comment" : [
            {token : "comment", regex : "\\*\\/", next : "no_regex"},
            {defaultToken : "comment"}
        ],
        "line_comment_regex_allowed" : [
            {token : "comment", regex : "$|^", next : "start"},
            {defaultToken : "comment"}
        ],
        "line_comment" : [
            {token : "comment", regex : "$|^", next : "no_regex"},
            {defaultToken : "comment"}
        ],
        "qqstring" : [
            {
                token : "constant.language.escape",
                regex : escapedRe
            }, {
                token : "string",
                regex : "\\\\$",
                next  : "qqstring"
            }, {
                token : "string",
                regex : '"|$',
                next  : "no_regex"
            }, {
                defaultToken: "string"
            }
        ],
        "qstring" : [
            {
                token : "constant.language.escape",
                regex : escapedRe
            }, {
                token : "string",
                regex : "\\\\$",
                next  : "qstring"
            }, {
                token : "string",
                regex : "'|$",
                next  : "no_regex"
            }, {
                defaultToken: "string"
            }
        ]
    };

    this.embedRules(DocCommentHighlightRules, "doc-",
        [ DocCommentHighlightRules.getEndRule("no_regex") ]);
};

oop.inherits(JavaScriptHighlightRules, TextHighlightRules);

exports.JavaScriptHighlightRules = JavaScriptHighlightRules;
});

ace.define('ace/mode/doc_comment_highlight_rules', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/text_highlight_rules'], function(require, exports, module) {


var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var DocCommentHighlightRules = function() {

    this.$rules = {
        "start" : [ {
            token : "comment.doc.tag",
            regex : "@[\\w\\d_]+" // TODO: fix email addresses
        }, {
            token : "comment.doc.tag",
            regex : "\\bTODO\\b"
        }, {
            defaultToken : "comment.doc"
        }]
    };
};

oop.inherits(DocCommentHighlightRules, TextHighlightRules);

DocCommentHighlightRules.getStartRule = function(start) {
    return {
        token : "comment.doc", // doc comment
        regex : "\\/\\*(?=\\*)",
        next  : start
    };
};

DocCommentHighlightRules.getEndRule = function (start) {
    return {
        token : "comment.doc", // closing comment
        regex : "\\*\\/",
        next  : start
    };
};


exports.DocCommentHighlightRules = DocCommentHighlightRules;

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

ace.define('ace/mode/html_highlight_rules', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/lib/lang', 'ace/mode/css_highlight_rules', 'ace/mode/javascript_highlight_rules', 'ace/mode/xml_highlight_rules'], function(require, exports, module) {


var oop = require("../lib/oop");
var lang = require("../lib/lang");
var CssHighlightRules = require("./css_highlight_rules").CssHighlightRules;
var JavaScriptHighlightRules = require("./javascript_highlight_rules").JavaScriptHighlightRules;
var XmlHighlightRules = require("./xml_highlight_rules").XmlHighlightRules;

var tagMap = lang.createMap({
    a           : 'anchor',
    button 	    : 'form',
    form        : 'form',
    img         : 'image',
    input       : 'form',
    label       : 'form',
    script      : 'script',
    select      : 'form',
    textarea    : 'form',
    style       : 'style',
    table       : 'table',
    tbody       : 'table',
    td          : 'table',
    tfoot       : 'table',
    th          : 'table',
    tr          : 'table'
});

var HtmlHighlightRules = function() {
    XmlHighlightRules.call(this);

    this.addRules({
        attributes: [{
            include : "space"
        }, {
            token : "entity.other.attribute-name",
            regex : "[-_a-zA-Z0-9:]+"
        }, {
            token : "keyword.operator.separator",
            regex : "=",
            push : [{
                include: "space"
            }, {
                token : "string",
                regex : "[^<>='\"`\\s]+",
                next : "pop"
            }, {
                token : "empty",
                regex : "",
                next : "pop"
            }]
        }, {
            include : "string"
        }],
        tag: [{
            token : function(start, tag) {
                var group = tagMap[tag];
                return ["meta.tag.punctuation.begin",
                    "meta.tag.name" + (group ? "." + group : "")];
            },
            regex : "(<)([-_a-zA-Z0-9:]+)",
            next: "start_tag_stuff"
        }, {
            token : function(start, tag) {
                var group = tagMap[tag];
                return ["meta.tag.punctuation.begin",
                    "meta.tag.name" + (group ? "." + group : "")];
            },
            regex : "(</)([-_a-zA-Z0-9:]+)",
            next: "end_tag_stuff"
        }],
        start_tag_stuff: [
            {include : "attributes"},
            {token : "meta.tag.punctuation.end", regex : "/?>", next : "start"}
        ],
        end_tag_stuff: [
            {include : "space"},
            {token : "meta.tag.punctuation.end", regex : ">", next : "start"}
        ]
    });

    this.embedTagRules(CssHighlightRules, "css-", "style");
    this.embedTagRules(JavaScriptHighlightRules, "js-", "script");

    if (this.constructor === HtmlHighlightRules)
        this.normalizeRules();
};

oop.inherits(HtmlHighlightRules, XmlHighlightRules);

exports.HtmlHighlightRules = HtmlHighlightRules;
});

ace.define('ace/mode/xml_highlight_rules', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/xml_util', 'ace/mode/text_highlight_rules'], function(require, exports, module) {


var oop = require("../lib/oop");
var xmlUtil = require("./xml_util");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var XmlHighlightRules = function(normalize) {
    this.$rules = {
        start : [
            {token : "punctuation.string.begin", regex : "<\\!\\[CDATA\\[", next : "cdata"},
            {
                token : ["punctuation.instruction.begin", "keyword.instruction"],
                regex : "(<\\?)(xml)(?=[\\s])", next : "xml_declaration"
            },
            {
                token : ["punctuation.instruction.begin", "keyword.instruction"],
                regex : "(<\\?)([-_a-zA-Z0-9]+)", next : "instruction"
            },
            {token : "comment", regex : "<\\!--", next : "comment"},
            {
                token : ["punctuation.doctype.begin", "meta.tag.doctype"],
                regex : "(<\\!)(DOCTYPE)(?=[\\s])", next : "doctype"
            },
            {include : "tag"},
            {include : "reference"}
        ],

        xml_declaration : [
            {include : "attributes"},
            {include : "instruction"}
        ],

        instruction : [
            {token : "punctuation.instruction.end", regex : "\\?>", next : "start"}
        ],

        doctype : [
            {include : "space"},
            {include : "string"},
            {token : "punctuation.doctype.end", regex : ">", next : "start"},
            {token : "xml-pe", regex : "[-_a-zA-Z0-9:]+"},
            {token : "punctuation.begin", regex : "\\[", push : "declarations"}
        ],

        declarations : [{
            token : "text",
            regex : "\\s+"
        }, {
            token: "punctuation.end",
            regex: "]",
            next: "pop"
        }, {
            token : ["punctuation.begin", "keyword"],
            regex : "(<\\!)([-_a-zA-Z0-9]+)",
            push : [{
                token : "text",
                regex : "\\s+"
            },
            {
                token : "punctuation.end",
                regex : ">",
                next : "pop"
            },
            {include : "string"}]
        }],

        cdata : [
            {token : "string.end", regex : "\\]\\]>", next : "start"},
            {token : "text", regex : "\\s+"},
            {token : "text", regex : "(?:[^\\]]|\\](?!\\]>))+"}
        ],

        comment : [
            {token : "comment", regex : "-->", next : "start"},
            {defaultToken : "comment"}
        ],

        tag : [{
            token : ["meta.tag.punctuation.begin", "meta.tag.name"],
            regex : "(<)((?:[-_a-zA-Z0-9]+:)?[-_a-zA-Z0-9]+)",
            next: [
                {include : "attributes"},
                {token : "meta.tag.punctuation.end", regex : "/?>", next : "start"}
            ]
        }, {
            token : ["meta.tag.punctuation.begin", "meta.tag.name"],
            regex : "(</)((?:[-_a-zA-Z0-9]+:)?[-_a-zA-Z0-9]+)",
            next: [
                {include : "space"},
                {token : "meta.tag.punctuation.end", regex : ">", next : "start"}
            ]
        }],

        space : [
            {token : "text", regex : "\\s+"}
        ],

        reference : [{
            token : "constant.language.escape",
            regex : "(?:&#[0-9]+;)|(?:&#x[0-9a-fA-F]+;)|(?:&[a-zA-Z0-9_:\\.-]+;)"
        }, {
            token : "invalid.illegal", regex : "&"
        }],

        string: [{
            token : "string",
            regex : "'",
            push : "qstring_inner"
        }, {
            token : "string",
            regex : '"',
            push : "qqstring_inner"
        }],

        qstring_inner: [
            {token : "string", regex: "'", next: "pop"},
            {include : "reference"},
            {defaultToken : "string"}
        ],

        qqstring_inner: [
            {token : "string", regex: '"', next: "pop"},
            {include : "reference"},
            {defaultToken : "string"}
        ],

        attributes: [{
            token : "entity.other.attribute-name",
            regex : "(?:[-_a-zA-Z0-9]+:)?[-_a-zA-Z0-9]+"
        }, {
            token : "keyword.operator.separator",
            regex : "="
        }, {
            include : "space"
        }, {
            include : "string"
        }]
    };

    if (this.constructor === XmlHighlightRules)
        this.normalizeRules();
};


(function() {

    this.embedTagRules = function(HighlightRules, prefix, tag){
        this.$rules.tag.unshift({
            token : ["meta.tag.punctuation.begin", "meta.tag.name." + tag],
            regex : "(<)(" + tag + ")",
            next: [
                {include : "space"},
                {include : "attributes"},
                {token : "meta.tag.punctuation.end", regex : "/?>", next : prefix + "start"}
            ]
        });

        this.$rules[tag + "-end"] = [
            {include : "space"},
            {token : "meta.tag.punctuation.end", regex : ">",  next: "start",
                onMatch : function(value, currentState, stack) {
                    stack.splice(0);
                    return this.token;
            }}
        ]

        this.embedRules(HighlightRules, prefix, [{
            token: ["meta.tag.punctuation.begin", "meta.tag.name." + tag],
            regex : "(</)(" + tag + ")",
            next: tag + "-end"
        }, {
            token: "string.begin",
            regex : "<\\!\\[CDATA\\["
        }, {
            token: "string.end",
            regex : "\\]\\]>"
        }]);
    };

}).call(TextHighlightRules.prototype);

oop.inherits(XmlHighlightRules, TextHighlightRules);

exports.XmlHighlightRules = XmlHighlightRules;
});

ace.define('ace/mode/xml_util', ['require', 'exports', 'module' ], function(require, exports, module) {


function string(state) {
    return [{
        token : "string",
        regex : '"',
        next : state + "_qqstring"
    }, {
        token : "string",
        regex : "'",
        next : state + "_qstring"
    }];
}

function multiLineString(quote, state) {
    return [
        {token : "string", regex : quote, next : state},
        {
            token : "constant.language.escape",
            regex : "(?:&#[0-9]+;)|(?:&#x[0-9a-fA-F]+;)|(?:&[a-zA-Z0-9_:\\.-]+;)" 
        },
        {defaultToken : "string"}
    ];
}

exports.tag = function(states, name, nextState, tagMap) {
    states[name] = [{
        token : "text",
        regex : "\\s+"
    }, {
        
    token : !tagMap ? "meta.tag.tag-name" : function(value) {
            if (tagMap[value])
                return "meta.tag.tag-name." + tagMap[value];
            else
                return "meta.tag.tag-name";
        },
        regex : "[-_a-zA-Z0-9:]+",
        next : name + "_embed_attribute_list" 
    }, {
        token: "empty",
        regex: "",
        next : name + "_embed_attribute_list"
    }];

    states[name + "_qstring"] = multiLineString("'", name + "_embed_attribute_list");
    states[name + "_qqstring"] = multiLineString("\"", name + "_embed_attribute_list");
    
    states[name + "_embed_attribute_list"] = [{
        token : "meta.tag.r",
        regex : "/?>",
        next : nextState
    }, {
        token : "keyword.operator",
        regex : "="
    }, {
        token : "entity.other.attribute-name",
        regex : "[-_a-zA-Z0-9:]+"
    }, {
        token : "constant.numeric", // float
        regex : "[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b"
    }, {
        token : "text",
        regex : "\\s+"
    }].concat(string(name));
};

});

ace.define('ace/mode/behaviour/html', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/behaviour/xml', 'ace/mode/behaviour/cstyle', 'ace/token_iterator'], function(require, exports, module) {


var oop = require("../../lib/oop");
var XmlBehaviour = require("../behaviour/xml").XmlBehaviour;
var CstyleBehaviour = require("./cstyle").CstyleBehaviour;
var TokenIterator = require("../../token_iterator").TokenIterator;
var voidElements = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

function hasType(token, type) {
    var tokenTypes = token.type.split('.');
    return type.split('.').every(function(type){
        return (tokenTypes.indexOf(type) !== -1);
    });
    return hasType;
}

var HtmlBehaviour = function () {

    this.inherit(XmlBehaviour); // Get xml behaviour
    
    this.add("autoclosing", "insertion", function (state, action, editor, session, text) {
        if (text == '>') {
            var position = editor.getCursorPosition();
            var iterator = new TokenIterator(session, position.row, position.column);
            var token = iterator.getCurrentToken();

            if (token && hasType(token, 'string') && iterator.getCurrentTokenColumn() + token.value.length > position.column)
                return;
            var atCursor = false;
            if (!token || !hasType(token, 'meta.tag') && !(hasType(token, 'text') && token.value.match('/'))){
                do {
                    token = iterator.stepBackward();
                } while (token && (hasType(token, 'string') || hasType(token, 'keyword.operator') || hasType(token, 'entity.attribute-name') || hasType(token, 'text')));
            } else {
                atCursor = true;
            }
            if (!token || !hasType(token, 'meta.tag.name') || iterator.stepBackward().value.match('/')) {
                return;
            }
            var element = token.value;
            if (atCursor){
                var element = element.substring(0, position.column - token.start);
            }
            if (voidElements.indexOf(element) !== -1){
                return;
            }
            return {
               text: '>' + '</' + element + '>',
               selection: [1, 1]
            }
        }
    });
}
oop.inherits(HtmlBehaviour, XmlBehaviour);

exports.HtmlBehaviour = HtmlBehaviour;
});

ace.define('ace/mode/behaviour/xml', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/behaviour', 'ace/mode/behaviour/cstyle', 'ace/token_iterator'], function(require, exports, module) {


var oop = require("../../lib/oop");
var Behaviour = require("../behaviour").Behaviour;
var CstyleBehaviour = require("./cstyle").CstyleBehaviour;
var TokenIterator = require("../../token_iterator").TokenIterator;

function hasType(token, type) {
    var tokenTypes = token.type.split('.');
    return type.split('.').every(function(type){
        return (tokenTypes.indexOf(type) !== -1);
    });
    return hasType;
}

var XmlBehaviour = function () {
    
    this.inherit(CstyleBehaviour, ["string_dquotes"]); // Get string behaviour
    
    this.add("autoclosing", "insertion", function (state, action, editor, session, text) {
        if (text == '>') {
            var position = editor.getCursorPosition();
            var iterator = new TokenIterator(session, position.row, position.column);
            var token = iterator.getCurrentToken();

            if (token && hasType(token, 'string') && iterator.getCurrentTokenColumn() + token.value.length > position.column)
                return;
            var atCursor = false;
            if (!token || !hasType(token, 'meta.tag') && !(hasType(token, 'text') && token.value.match('/'))){
                do {
                    token = iterator.stepBackward();
                } while (token && (hasType(token, 'string') || hasType(token, 'keyword.operator') || hasType(token, 'entity.attribute-name') || hasType(token, 'text')));
            } else {
                atCursor = true;
            }
            if (!token || !hasType(token, 'meta.tag.name') || iterator.stepBackward().value.match('/')) {
                return;
            }
            var tag = token.value;
            if (atCursor){
                var tag = tag.substring(0, position.column - token.start);
            }

            return {
               text: '>' + '</' + tag + '>',
               selection: [1, 1]
            }
        }
    });

    this.add('autoindent', 'insertion', function (state, action, editor, session, text) {
        if (text == "\n") {
            var cursor = editor.getCursorPosition();
            var line = session.getLine(cursor.row);
            var rightChars = line.substring(cursor.column, cursor.column + 2);
            if (rightChars == '</') {
                var next_indent = this.$getIndent(line);
                var indent = next_indent + session.getTabString();

                return {
                    text: '\n' + indent + '\n' + next_indent,
                    selection: [1, indent.length, 1, indent.length]
                }
            }
        }
    });
    
}
oop.inherits(XmlBehaviour, Behaviour);

exports.XmlBehaviour = XmlBehaviour;
});

ace.define('ace/mode/folding/html', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/folding/mixed', 'ace/mode/folding/xml', 'ace/mode/folding/cstyle'], function(require, exports, module) {


var oop = require("../../lib/oop");
var MixedFoldMode = require("./mixed").FoldMode;
var XmlFoldMode = require("./xml").FoldMode;
var CStyleFoldMode = require("./cstyle").FoldMode;

var FoldMode = exports.FoldMode = function() {
    MixedFoldMode.call(this, new XmlFoldMode({
        "area": 1,
        "base": 1,
        "br": 1,
        "col": 1,
        "command": 1,
        "embed": 1,
        "hr": 1,
        "img": 1,
        "input": 1,
        "keygen": 1,
        "link": 1,
        "meta": 1,
        "param": 1,
        "source": 1,
        "track": 1,
        "wbr": 1,
        "li": 1,
        "dt": 1,
        "dd": 1,
        "p": 1,
        "rt": 1,
        "rp": 1,
        "optgroup": 1,
        "option": 1,
        "colgroup": 1,
        "td": 1,
        "th": 1
    }), {
        "js-": new CStyleFoldMode(),
        "css-": new CStyleFoldMode()
    });
};

oop.inherits(FoldMode, MixedFoldMode);

});

ace.define('ace/mode/folding/mixed', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/folding/fold_mode'], function(require, exports, module) {


var oop = require("../../lib/oop");
var BaseFoldMode = require("./fold_mode").FoldMode;

var FoldMode = exports.FoldMode = function(defaultMode, subModes) {
    this.defaultMode = defaultMode;
    this.subModes = subModes;
};
oop.inherits(FoldMode, BaseFoldMode);

(function() {


    this.$getMode = function(state) {
        if (typeof state != "string") 
            state = state[0];
        for (var key in this.subModes) {
            if (state.indexOf(key) === 0)
                return this.subModes[key];
        }
        return null;
    };
    
    this.$tryMode = function(state, session, foldStyle, row) {
        var mode = this.$getMode(state);
        return (mode ? mode.getFoldWidget(session, foldStyle, row) : "");
    };

    this.getFoldWidget = function(session, foldStyle, row) {
        return (
            this.$tryMode(session.getState(row-1), session, foldStyle, row) ||
            this.$tryMode(session.getState(row), session, foldStyle, row) ||
            this.defaultMode.getFoldWidget(session, foldStyle, row)
        );
    };

    this.getFoldWidgetRange = function(session, foldStyle, row) {
        var mode = this.$getMode(session.getState(row-1));
        
        if (!mode || !mode.getFoldWidget(session, foldStyle, row))
            mode = this.$getMode(session.getState(row));
        
        if (!mode || !mode.getFoldWidget(session, foldStyle, row))
            mode = this.defaultMode;
        
        return mode.getFoldWidgetRange(session, foldStyle, row);
    };

}).call(FoldMode.prototype);

});

ace.define('ace/mode/folding/xml', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/lib/lang', 'ace/range', 'ace/mode/folding/fold_mode', 'ace/token_iterator'], function(require, exports, module) {


var oop = require("../../lib/oop");
var lang = require("../../lib/lang");
var Range = require("../../range").Range;
var BaseFoldMode = require("./fold_mode").FoldMode;
var TokenIterator = require("../../token_iterator").TokenIterator;

var FoldMode = exports.FoldMode = function(voidElements) {
    BaseFoldMode.call(this);
    this.voidElements = voidElements || {};
};
oop.inherits(FoldMode, BaseFoldMode);

(function() {

    this.getFoldWidget = function(session, foldStyle, row) {
        var tag = this._getFirstTagInLine(session, row);

        if (tag.closing)
            return foldStyle == "markbeginend" ? "end" : "";

        if (!tag.tagName || this.voidElements[tag.tagName.toLowerCase()])
            return "";

        if (tag.selfClosing)
            return "";

        if (tag.value.indexOf("/" + tag.tagName) !== -1)
            return "";

        return "start";
    };
    
    this._getFirstTagInLine = function(session, row) {
        var tokens = session.getTokens(row);
        var value = "";
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i];
            if (token.type.lastIndexOf("meta.tag", 0) === 0)
                value += token.value;
            else
                value += lang.stringRepeat(" ", token.value.length);
        }
        
        return this._parseTag(value);
    };

    this.tagRe = /^(\s*)(<?(\/?)([-_a-zA-Z0-9:!]*)\s*(\/?)>?)/;
    this._parseTag = function(tag) {
        
        var match = tag.match(this.tagRe);
        var column = 0;

        return {
            value: tag,
            match: match ? match[2] : "",
            closing: match ? !!match[3] : false,
            selfClosing: match ? !!match[5] || match[2] == "/>" : false,
            tagName: match ? match[4] : "",
            column: match[1] ? column + match[1].length : column
        };
    };
    this._readTagForward = function(iterator) {
        var token = iterator.getCurrentToken();
        if (!token)
            return null;
            
        var value = "";
        var start;
        
        do {
            if (token.type.lastIndexOf("meta.tag", 0) === 0) {
                if (!start) {
                    var start = {
                        row: iterator.getCurrentTokenRow(),
                        column: iterator.getCurrentTokenColumn()
                    };
                }
                value += token.value;
                if (value.indexOf(">") !== -1) {
                    var tag = this._parseTag(value);
                    tag.start = start;
                    tag.end = {
                        row: iterator.getCurrentTokenRow(),
                        column: iterator.getCurrentTokenColumn() + token.value.length
                    };
                    iterator.stepForward();
                    return tag;
                }
            }
        } while(token = iterator.stepForward());
        
        return null;
    };
    
    this._readTagBackward = function(iterator) {
        var token = iterator.getCurrentToken();
        if (!token)
            return null;
            
        var value = "";
        var end;

        do {
            if (token.type.lastIndexOf("meta.tag", 0) === 0) {
                if (!end) {
                    end = {
                        row: iterator.getCurrentTokenRow(),
                        column: iterator.getCurrentTokenColumn() + token.value.length
                    };
                }
                value = token.value + value;
                if (value.indexOf("<") !== -1) {
                    var tag = this._parseTag(value);
                    tag.end = end;
                    tag.start = {
                        row: iterator.getCurrentTokenRow(),
                        column: iterator.getCurrentTokenColumn()
                    };
                    iterator.stepBackward();
                    return tag;
                }
            }
        } while(token = iterator.stepBackward());
        
        return null;
    };
    
    this._pop = function(stack, tag) {
        while (stack.length) {
            
            var top = stack[stack.length-1];
            if (!tag || top.tagName == tag.tagName) {
                return stack.pop();
            }
            else if (this.voidElements[tag.tagName]) {
                return;
            }
            else if (this.voidElements[top.tagName]) {
                stack.pop();
                continue;
            } else {
                return null;
            }
        }
    };
    
    this.getFoldWidgetRange = function(session, foldStyle, row) {
        var firstTag = this._getFirstTagInLine(session, row);
        
        if (!firstTag.match)
            return null;
        
        var isBackward = firstTag.closing || firstTag.selfClosing;
        var stack = [];
        var tag;
        
        if (!isBackward) {
            var iterator = new TokenIterator(session, row, firstTag.column);
            var start = {
                row: row,
                column: firstTag.column + firstTag.tagName.length + 2
            };
            while (tag = this._readTagForward(iterator)) {
                if (tag.selfClosing) {
                    if (!stack.length) {
                        tag.start.column += tag.tagName.length + 2;
                        tag.end.column -= 2;
                        return Range.fromPoints(tag.start, tag.end);
                    } else
                        continue;
                }
                
                if (tag.closing) {
                    this._pop(stack, tag);
                    if (stack.length == 0)
                        return Range.fromPoints(start, tag.start);
                }
                else {
                    stack.push(tag)
                }
            }
        }
        else {
            var iterator = new TokenIterator(session, row, firstTag.column + firstTag.match.length);
            var end = {
                row: row,
                column: firstTag.column
            };
            
            while (tag = this._readTagBackward(iterator)) {
                if (tag.selfClosing) {
                    if (!stack.length) {
                        tag.start.column += tag.tagName.length + 2;
                        tag.end.column -= 2;
                        return Range.fromPoints(tag.start, tag.end);
                    } else
                        continue;
                }
                
                if (!tag.closing) {
                    this._pop(stack, tag);
                    if (stack.length == 0) {
                        tag.start.column += tag.tagName.length + 2;
                        return Range.fromPoints(tag.start, end);
                    }
                }
                else {
                    stack.push(tag)
                }
            }
        }
        
    };

}).call(FoldMode.prototype);

});

ace.define('ace/mode/html_completions', ['require', 'exports', 'module' , 'ace/token_iterator'], function(require, exports, module) {


var TokenIterator = require("../token_iterator").TokenIterator;

var commonAttributes = [
    "accesskey",
    "class",
    "contenteditable",
    "contextmenu",
    "dir",
    "draggable",
    "dropzone",
    "hidden",
    "id",
    "lang",
    "spellcheck",
    "style",
    "tabindex",
    "title",
    "translate"
];

var eventAttributes = [
    "onabort",
    "onblur",
    "oncancel",
    "oncanplay",
    "oncanplaythrough",
    "onchange",
    "onclick",
    "onclose",
    "oncontextmenu",
    "oncuechange",
    "ondblclick",
    "ondrag",
    "ondragend",
    "ondragenter",
    "ondragleave",
    "ondragover",
    "ondragstart",
    "ondrop",
    "ondurationchange",
    "onemptied",
    "onended",
    "onerror",
    "onfocus",
    "oninput",
    "oninvalid",
    "onkeydown",
    "onkeypress",
    "onkeyup",
    "onload",
    "onloadeddata",
    "onloadedmetadata",
    "onloadstart",
    "onmousedown",
    "onmousemove",
    "onmouseout",
    "onmouseover",
    "onmouseup",
    "onmousewheel",
    "onpause",
    "onplay",
    "onplaying",
    "onprogress",
    "onratechange",
    "onreset",
    "onscroll",
    "onseeked",
    "onseeking",
    "onselect",
    "onshow",
    "onstalled",
    "onsubmit",
    "onsuspend",
    "ontimeupdate",
    "onvolumechange",
    "onwaiting"
];

var globalAttributes = commonAttributes.concat(eventAttributes);

var attributeMap = {
    "html": ["manifest"],
    "head": [],
    "title": [],
    "base": ["href", "target"],
    "link": ["href", "hreflang", "rel", "media", "type", "sizes"],
    "meta": ["http-equiv", "name", "content", "charset"],
    "style": ["type", "media", "scoped"],
    "script": ["charset", "type", "src", "defer", "async"],
    "noscript": ["href"],
    "body": ["onafterprint", "onbeforeprint", "onbeforeunload", "onhashchange", "onmessage", "onoffline", "onpopstate", "onredo", "onresize", "onstorage", "onundo", "onunload"],
    "section": [],
    "nav": [],
    "article": ["pubdate"],
    "aside": [],
    "h1": [],
    "h2": [],
    "h3": [],
    "h4": [],
    "h5": [],
    "h6": [],
    "header": [],
    "footer": [],
    "address": [],
    "main": [],
    "p": [],
    "hr": [],
    "pre": [],
    "blockquote": ["cite"],
    "ol": ["start", "reversed"],
    "ul": [],
    "li": ["value"],
    "dl": [],
    "dt": [],
    "dd": [],
    "figure": [],
    "figcaption": [],
    "div": [],
    "a": ["href", "target", "ping", "rel", "media", "hreflang", "type"],
    "em": [],
    "strong": [],
    "small": [],
    "s": [],
    "cite": [],
    "q": ["cite"],
    "dfn": [],
    "abbr": [],
    "data": [],
    "time": ["datetime"],
    "code": [],
    "var": [],
    "samp": [],
    "kbd": [],
    "sub": [],
    "sup": [],
    "i": [],
    "b": [],
    "u": [],
    "mark": [],
    "ruby": [],
    "rt": [],
    "rp": [],
    "bdi": [],
    "bdo": [],
    "span": [],
    "br": [],
    "wbr": [],
    "ins": ["cite", "datetime"],
    "del": ["cite", "datetime"],
    "img": ["alt", "src", "height", "width", "usemap", "ismap"],
    "iframe": ["name", "src", "height", "width", "sandbox", "seamless"],
    "embed": ["src", "height", "width", "type"],
    "object": ["param", "data", "type", "height" , "width", "usemap", "name", "form", "classid"],
    "param": ["name", "value"],
    "video": ["src", "autobuffer", "autoplay", "loop", "controls", "width", "height", "poster"],
    "audio": ["src", "autobuffer", "autoplay", "loop", "controls"],
    "source": ["src", "type", "media"],
    "track": ["kind", "src", "srclang", "label", "default"],
    "canvas": ["width", "height"],
    "map": ["name"],
    "area": ["shape", "coords", "href", "hreflang", "alt", "target", "media", "rel", "ping", "type"],
    "svg": [],
    "math": [],
    "table": ["summary"],
    "caption": [],
    "colgroup": ["span"],
    "col": ["span"],
    "tbody": [],
    "thead": [],
    "tfoot": [],
    "tr": [],
    "td": ["headers", "rowspan", "colspan"],
    "th": ["headers", "rowspan", "colspan", "scope"],
    "form": ["accept-charset", "action", "autocomplete", "enctype", "method", "name", "novalidate", "target"],
    "fieldset": ["disabled", "form", "name"],
    "legend": [],
    "label": ["form", "for"],
    "input": ["type", "accept", "alt", "autocomplete", "checked", "disabled", "form", "formaction", "formenctype", "formmethod", "formnovalidate", "formtarget", "height", "list", "max", "maxlength", "min", "multiple", "pattern", "placeholder", "readonly", "required", "size", "src", "step", "width", "files", "value"],
    "button": ["autofocus", "disabled", "form", "formaction", "formenctype", "formmethod", "formnovalidate", "formtarget", "name", "value", "type"],
    "select": ["autofocus", "disabled", "form", "multiple", "name", "size"],
    "datalist": [],
    "optgroup": ["disabled", "label"],
    "option": ["disabled", "selected", "label", "value"],
    "textarea": ["autofocus", "disabled", "form", "maxlength", "name", "placeholder", "readonly", "required", "rows", "cols", "wrap"],
    "keygen": ["autofocus", "challenge", "disabled", "form", "keytype", "name"],
    "output": ["for", "form", "name"],
    "progress": ["value", "max"],
    "meter": ["value", "min", "max", "low", "high", "optimum"],
    "details": ["open"],
    "summary": [],
    "command": ["type", "label", "icon", "disabled", "checked", "radiogroup", "command"],
    "menu": ["type", "label"],
    "dialog": ["open"]
};

var allElements = Object.keys(attributeMap);

function hasType(token, type) {
    var tokenTypes = token.type.split('.');
    return type.split('.').every(function(type){
        return (tokenTypes.indexOf(type) !== -1);
    });
}

function findTagName(session, pos) {
    var iterator = new TokenIterator(session, pos.row, pos.column);
    var token = iterator.getCurrentToken();
    if (!token || !hasType(token, 'tag') && !(hasType(token, 'text') && token.value.match('/'))){
        do {
            token = iterator.stepBackward();
        } while (token && (hasType(token, 'string') || hasType(token, 'operator') || hasType(token, 'attribute-name') || hasType(token, 'text')));
    }
    if (token && hasType(token, 'tag-name') && !iterator.stepBackward().value.match('/'))
        return token.value;
}

var HtmlCompletions = function() {

};

(function() {

    this.getCompletions = function(state, session, pos, prefix) {
        var token = session.getTokenAt(pos.row, pos.column);

        if (!token)
            return [];
        if (hasType(token, "tag-name") || (token.value == '<' && hasType(token, "text")))
            return this.getTagCompletions(state, session, pos, prefix);
        if (hasType(token, 'text') || hasType(token, 'attribute-name'))
            return this.getAttributeCompetions(state, session, pos, prefix);

        return [];
    };

    this.getTagCompletions = function(state, session, pos, prefix) {
        var elements = allElements;
        if (prefix) {
            elements = elements.filter(function(element){
                return element.indexOf(prefix) === 0;
            });
        }
        return elements.map(function(element){
            return {
                value: element,
                meta: "tag"
            };
        });
    };

    this.getAttributeCompetions = function(state, session, pos, prefix) {
        var tagName = findTagName(session, pos);
        if (!tagName)
            return [];
        var attributes = globalAttributes;
        if (tagName in attributeMap) {
            attributes = attributes.concat(attributeMap[tagName]);
        }
        if (prefix) {
            attributes = attributes.filter(function(attribute){
                return attribute.indexOf(prefix) === 0;
            });
        }
        return attributes.map(function(attribute){
            return {
                caption: attribute,
                snippet: attribute + '="$0"',
                meta: "attribute"
            };
        });
    };

}).call(HtmlCompletions.prototype);

exports.HtmlCompletions = HtmlCompletions;
});
