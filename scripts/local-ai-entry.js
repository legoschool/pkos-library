// Only the two architectures used by this app are bundled. The dependency is
// pinned because these source-level imports are internal to Transformers.js.
import {env} from '../node_modules/@huggingface/transformers/src/env.js';
import {BertModel} from '../node_modules/@huggingface/transformers/src/models/bert/modeling_bert.js';
import {BertTokenizer} from '../node_modules/@huggingface/transformers/src/models/bert/tokenization_bert.js';
import {WhisperForConditionalGeneration} from '../node_modules/@huggingface/transformers/src/models/whisper/modeling_whisper.js';
import {WhisperTokenizer} from '../node_modules/@huggingface/transformers/src/models/whisper/tokenization_whisper.js';
import {WhisperFeatureExtractor} from '../node_modules/@huggingface/transformers/src/models/whisper/feature_extraction_whisper.js';
import {Processor} from '../node_modules/@huggingface/transformers/src/processing_utils.js';
import {FeatureExtractionPipeline} from '../node_modules/@huggingface/transformers/src/pipelines/feature-extraction.js';
import {AutomaticSpeechRecognitionPipeline} from '../node_modules/@huggingface/transformers/src/pipelines/automatic-speech-recognition.js';
import {MODEL_TYPES,MODEL_TYPE_MAPPING,MODEL_CLASS_TO_NAME_MAPPING,MODEL_NAME_TO_CLASS_MAPPING,registerTaskMappings} from '../node_modules/@huggingface/transformers/src/models/modeling_utils.js';
for(const [name,model,type]of [['BertModel',BertModel,MODEL_TYPES.EncoderOnly],['WhisperForConditionalGeneration',WhisperForConditionalGeneration,MODEL_TYPES.Seq2Seq]]){MODEL_TYPE_MAPPING.set(name,type);MODEL_CLASS_TO_NAME_MAPPING.set(model,name);MODEL_NAME_TO_CLASS_MAPPING.set(name,model);}
MODEL_TYPE_MAPPING.set('bert',MODEL_TYPES.EncoderOnly);MODEL_TYPE_MAPPING.set('whisper',MODEL_TYPES.Seq2Seq);
registerTaskMappings({MODEL_FOR_SPEECH_SEQ_2_SEQ_MAPPING_NAMES:new Map([['whisper','WhisperForConditionalGeneration']])});
class WhisperOnlyProcessor extends Processor{static tokenizer_class=WhisperTokenizer;static feature_extractor_class=WhisperFeatureExtractor;async _call(audio){return this.feature_extractor(audio);}}
export {env};
export async function pipeline(task,id,options){
 if(task==='feature-extraction'){const [model,tokenizer]=await Promise.all([BertModel.from_pretrained(id,options),BertTokenizer.from_pretrained(id,options)]);return new FeatureExtractionPipeline({task,model,tokenizer});}
 if(task==='automatic-speech-recognition'){const [model,tokenizer,processor]=await Promise.all([WhisperForConditionalGeneration.from_pretrained(id,options),WhisperTokenizer.from_pretrained(id,options),WhisperOnlyProcessor.from_pretrained(id,options)]);return new AutomaticSpeechRecognitionPipeline({task,model,tokenizer,processor});}
 throw Error('Unsupported local task: '+task);
}
